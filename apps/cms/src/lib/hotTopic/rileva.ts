import type { Payload } from 'payload'
import { leggiConfigurazione } from '@/lib/ai/client'
import { ADATTATORI, type FonteDaLeggere } from '@/lib/fonti'
import { raggruppa, type NotiziaDaRaggruppare } from './cluster'
import { calcolaPunteggio, escluso, type RiferimentoPerPunteggio } from './punteggio'

/**
 * Rilevamento degli hot topic — RF-AI-01, RF-AI-02, RF-AI-03.
 *
 * Un giro fa sei cose:
 *  1. legge le fonti attive il cui intervallo di interrogazione e' scaduto;
 *  2. salva le notizie nuove (una per URL) e aggiorna la diagnostica della fonte;
 *  3. raggruppa TUTTE le notizie della finestra, non solo quelle appena lette:
 *     e' cosi' che due testate che escono a ore di distanza si incontrano;
 *  4. calcola il punteggio di ogni gruppo;
 *  5. aggiorna gli argomenti gia' proposti e crea quelli nuovi sopra soglia;
 *  6. ricalcola il punteggio degli argomenti che non ricevono piu' notizie,
 *     e cancella le notizie piu' vecchie di una settimana.
 *
 * Un argomento che la redazione ha scartato o convertito in articolo non viene
 * mai toccato: le sue notizie restano nella finestra per qualche ora, e senza
 * questo vincolo l'argomento ricomparirebbe come nuovo al giro successivo.
 */

/** Notizie considerate per il raggruppamento. */
const FINESTRA_ORE = 48
/** Dopo quanto le notizie lette vengono cancellate. */
const CONSERVAZIONE_GIORNI = 7
/** Fino a quando un argomento senza notizie nuove viene ancora ricalcolato. */
const RICALCOLO_GIORNI = 7
const RIFERIMENTI_MAX = 20
/** Tolleranza sull'intervallo: il job gira ogni 5 minuti, non al secondo esatto. */
const TOLLERANZA_MS = 60_000

const STATI_APERTI = new Set(['nuovo', 'in_lavorazione'])

export interface EsitoRilevamento {
  saltato?: string
  fontiLette: number
  fontiInErrore: number
  notizieNuove: number
  argomentiCreati: number
  argomentiAggiornati: number
  notizieCancellate: number
}

interface Riferimento {
  title: string
  url: string
  publisher?: string | null
  publishedAt?: string | null
  source?: string | null
}

interface ArgomentoSalvato {
  id: string
  title: string
  summary?: string | null
  status: string
  score?: number | null
  clusterKey?: string | null
  keywords?: string[] | null
  references?: Riferimento[] | null
}

const idDi = (v: unknown): string | null =>
  v && typeof v === 'object' && 'id' in v ? String((v as { id: unknown }).id) : v ? String(v) : null

function perPunteggio(r: Riferimento): RiferimentoPerPunteggio {
  return {
    titolo: r.title,
    testata: r.publisher,
    dataPubblicazione: r.publishedAt,
    fonteId: r.source,
  }
}

/** Unione per URL, dalle piu' recenti, con un tetto: l'elenco fonti deve restare leggibile. */
function unisciRiferimenti(...elenchi: Riferimento[][]): Riferimento[] {
  const perUrl = new Map<string, Riferimento>()
  for (const elenco of elenchi) for (const r of elenco) if (!perUrl.has(r.url)) perUrl.set(r.url, r)
  return [...perUrl.values()]
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
    .slice(0, RIFERIMENTI_MAX)
}

/** Codice SQLSTATE di un errore del database, anche se avvolto da Payload/Drizzle. */
function codiceDb(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } }
  return e?.cause?.code ?? e?.code
}

/**
 * Il motivo leggibile di un errore. Drizzle avvolge l'errore del database in
 * «Failed query: insert …» con tutti i parametri: il motivo vero sta in `cause`.
 */
function motivoErrore(err: unknown): string {
  const e = err as { message?: string; cause?: { message?: string } }
  return e?.cause?.message || e?.message || String(err)
}

export async function rilevaHotTopic(
  payload: Payload,
  adesso = new Date(),
  /** `forza`: legge tutte le fonti attive ora, senza aspettare il loro intervallo (ricerca manuale). */
  opzioni: { forza?: boolean } = {},
): Promise<EsitoRilevamento> {
  const esito: EsitoRilevamento = {
    fontiLette: 0,
    fontiInErrore: 0,
    notizieNuove: 0,
    argomentiCreati: 0,
    argomentiAggiornati: 0,
    notizieCancellate: 0,
  }

  // L'interruttore generale vale anche qui (RNF-10): spento il modulo AI, non si
  // interrogano fonti ne' si propongono argomenti. La chiave API non serve:
  // il rilevamento non chiama il modello.
  const config = await leggiConfigurazione(payload)
  if (!config.enabled) return { ...esito, saltato: 'Modulo AI disattivato in Impostazioni AI' }

  const criteri = { themes: config.themes, boostKeywords: config.boostKeywords }

  const { docs: fonti } = await payload.find({
    collection: 'sources',
    where: { enabled: { equals: true } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })

  const pesi = new Map(fonti.map((f) => [String(f.id), Number(f.weight ?? 1)]))
  const pesoFonte = (id: string | null | undefined) => (id ? (pesi.get(id) ?? 1) : 1)

  const daLeggere = fonti.filter((f) => {
    if (opzioni.forza || !f.lastFetchedAt) return true
    const trascorso = adesso.getTime() - new Date(f.lastFetchedAt).getTime()
    // Un'ultima lettura «nel futuro» (orologio spostato, prove con date
    // simulate) fermerebbe la fonte fino a quella data: la rileggiamo subito.
    if (trascorso < 0) return true
    return trascorso + TOLLERANZA_MS >= Number(f.pollIntervalMinutes ?? 60) * 60_000
  })

  if (daLeggere.length === 0)
    return { ...esito, saltato: 'Nessuna fonte da interrogare in questo giro' }

  /* 1-2. Lettura delle fonti ------------------------------------------------ */

  const inizioFinestra = new Date(adesso.getTime() - FINESTRA_ORE * 3_600_000)

  for (const f of daLeggere) {
    const fonte: FonteDaLeggere = {
      id: String(f.id),
      name: f.name,
      type: f.type,
      endpoint: f.endpoint,
      query: f.query,
    }

    const diagnostica = async (errore: string | null) => {
      await payload.update({
        collection: 'sources',
        id: fonte.id,
        overrideAccess: true,
        data: {
          lastFetchedAt: adesso.toISOString(),
          lastStatus: errore ? 'errore' : 'ok',
          lastError: errore,
        },
      })
    }

    const adattatore = ADATTATORI[fonte.type]
    if (!adattatore) {
      esito.fontiInErrore++
      await diagnostica(
        `Il tipo di fonte "${fonte.type}" non è ancora supportato: per ora vengono lette solo le fonti RSS / Atom.`,
      )
      continue
    }

    try {
      const grezze = await adattatore(fonte)
      const lette = grezze.filter(
        (n) =>
          new Date(n.dataPubblicazione) >= inizioFinestra &&
          !escluso(`${n.titolo}\n${n.estratto ?? ''}`, config.excludeKeywords),
      )

      const urls = [...new Set(lette.map((n) => n.url))]
      const { docs: gia } = urls.length
        ? await payload.find({
            collection: 'news-items',
            where: { url: { in: urls } },
            pagination: false,
            depth: 0,
            overrideAccess: true,
            select: { url: true },
          })
        : { docs: [] }
      const note = new Set(gia.map((d) => d.url))

      // Una notizia che non entra non deve fermare le altre della stessa fonte.
      // Il caso tipico è un giro concorrente che l'ha già salvata (URL unico):
      // non è un errore. Gli altri si contano e finiscono nella diagnostica.
      let scartate = 0
      let primoErrore: string | null = null
      for (const n of lette) {
        if (note.has(n.url)) continue
        note.add(n.url)
        try {
          await payload.create({
            collection: 'news-items',
            overrideAccess: true,
            data: {
              title: n.titolo,
              url: n.url,
              publisher: n.testata,
              publishedAt: n.dataPubblicazione,
              excerpt: n.estratto,
              source: fonte.id,
            },
          })
          esito.notizieNuove++
        } catch (err) {
          if (codiceDb(err) === '23505') continue
          scartate++
          primoErrore ??= motivoErrore(err)
        }
      }

      esito.fontiLette++

      // Un feed abbandonato risponde 200 con notizie di anni prima: tecnicamente
      // funziona, ma non porta nulla. Senza questo avviso sembrerebbe una fonte sana.
      const piuRecente = grezze.reduce(
        (m, n) => (n.dataPubblicazione > m ? n.dataPubblicazione : m),
        '',
      )
      if (grezze.length === 0) {
        await diagnostica('Il feed risponde ma non contiene notizie.')
      } else if (
        new Date(piuRecente).getTime() <
        adesso.getTime() - CONSERVAZIONE_GIORNI * 86_400_000
      ) {
        const data = new Date(piuRecente).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' })
        await diagnostica(
          `Il feed risponde ma la notizia più recente è del ${data}: probabilmente non viene più aggiornato.`,
        )
      } else if (scartate > 0) {
        await diagnostica(`${scartate} notizie non salvate: ${primoErrore}`)
      } else {
        await diagnostica(null)
      }
    } catch (err) {
      esito.fontiInErrore++
      const messaggio = motivoErrore(err)
      payload.logger.warn(`[hot-topic] fonte "${fonte.name}": ${messaggio}`)
      await diagnostica(messaggio.slice(0, 500))
    }
  }

  /* 3. Raggruppamento ------------------------------------------------------- */

  const { docs: inFinestra } = await payload.find({
    collection: 'news-items',
    where: { publishedAt: { greater_than_equal: inizioFinestra.toISOString() } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })

  const notizie: NotiziaDaRaggruppare[] = inFinestra
    .map((d) => ({
      titolo: d.title,
      url: d.url,
      testata: d.publisher ?? '',
      dataPubblicazione: d.publishedAt,
      estratto: d.excerpt ?? undefined,
      fonteId: idDi(d.source) ?? '',
    }))
    // Una fonte disattivata smette di contare subito, non dopo 48 ore; e le
    // esclusioni valgono anche per notizie salvate prima di essere configurate.
    .filter((n) => pesi.has(n.fonteId))
    .filter((n) => !escluso(`${n.titolo}\n${n.estratto ?? ''}`, config.excludeKeywords))

  const gruppi = raggruppa(notizie)

  /* 4-5. Punteggio e salvataggio -------------------------------------------- */

  const tuttiGliUrl = [...new Set(gruppi.flatMap((g) => g.notizie.map((n) => n.url)))]
  const { docs: esistentiGrezzi } = tuttiGliUrl.length
    ? await payload.find({
        collection: 'hot-topics',
        where: {
          or: [
            { 'references.url': { in: tuttiGliUrl } },
            { clusterKey: { in: gruppi.map((g) => g.chiave) } },
          ],
        },
        pagination: false,
        depth: 0,
        overrideAccess: true,
      })
    : { docs: [] }

  const esistenti = esistentiGrezzi as unknown as ArgomentoSalvato[]
  const perUrl = new Map<string, ArgomentoSalvato>()
  const perChiave = new Map<string, ArgomentoSalvato>()
  for (const a of esistenti) {
    for (const r of a.references ?? []) perUrl.set(r.url, a)
    if (a.clusterKey) perChiave.set(a.clusterKey, a)
  }

  // Due gruppi di questo giro possono ricadere nello stesso argomento salvato
  // (il raggruppamento si rifà ogni volta): si accumulano e si scrive una volta sola.
  const daAggiornare = new Map<
    string,
    { argomento: ArgomentoSalvato; riferimenti: Riferimento[] }
  >()
  const nuovi: Array<{
    gruppo: (typeof gruppi)[number]
    riferimenti: Riferimento[]
    punteggio: number
  }> = []

  for (const g of gruppi) {
    const riferimenti: Riferimento[] = g.notizie.map((n) => ({
      title: n.titolo,
      url: n.url,
      publisher: n.testata,
      publishedAt: n.dataPubblicazione,
      source: n.fonteId,
    }))

    const sovrapposizioni = new Map<string, { argomento: ArgomentoSalvato; n: number }>()
    for (const n of g.notizie) {
      const a = perUrl.get(n.url)
      if (!a) continue
      const v = sovrapposizioni.get(a.id) ?? { argomento: a, n: 0 }
      v.n++
      sovrapposizioni.set(a.id, v)
    }
    const corrispondente =
      [...sovrapposizioni.values()].sort((x, y) => y.n - x.n)[0]?.argomento ??
      perChiave.get(g.chiave)

    if (corrispondente) {
      if (!STATI_APERTI.has(corrispondente.status)) continue
      const prec = daAggiornare.get(corrispondente.id)
      daAggiornare.set(corrispondente.id, {
        argomento: corrispondente,
        riferimenti: unisciRiferimenti(
          prec?.riferimenti ?? corrispondente.references ?? [],
          riferimenti,
        ),
      })
      continue
    }

    const punteggio = calcolaPunteggio(
      riferimenti.map(perPunteggio),
      g.rappresentativa.estratto ?? '',
      criteri,
      pesoFonte,
      adesso,
    )
    if (punteggio >= config.minScore) nuovi.push({ gruppo: g, riferimenti, punteggio })
  }

  for (const { argomento, riferimenti } of daAggiornare.values()) {
    const punteggio = calcolaPunteggio(
      riferimenti.map(perPunteggio),
      argomento.summary ?? '',
      criteri,
      pesoFonte,
      adesso,
    )
    await payload.update({
      collection: 'hot-topics',
      id: argomento.id,
      overrideAccess: true,
      data: {
        score: punteggio,
        references: riferimenti.map(({ source, ...r }) => ({ ...r, source: source || null })),
      },
    })
    esito.argomentiAggiornati++
  }

  nuovi.sort((a, b) => b.punteggio - a.punteggio)
  for (const { gruppo, riferimenti, punteggio } of nuovi.slice(0, config.maxTopicsPerRun)) {
    try {
      await payload.create({
        collection: 'hot-topics',
        overrideAccess: true,
        data: {
          title: gruppo.rappresentativa.titolo,
          summary: gruppo.rappresentativa.estratto ?? null,
          status: 'nuovo',
          score: punteggio,
          detectedAt: adesso.toISOString(),
          keywords: gruppo.paroleChiave,
          clusterKey: gruppo.chiave,
          references: unisciRiferimenti(riferimenti).map(({ source, ...r }) => ({
            ...r,
            source: source || null,
          })),
        },
      })
      esito.argomentiCreati++
    } catch (err) {
      // Collisione su clusterKey con un giro concorrente: l'argomento esiste gia'.
      payload.logger.warn(`[hot-topic] creazione saltata: ${(err as Error).message}`)
    }
  }

  /* 6. Decadimento e pulizia ------------------------------------------------- */

  const { docs: aperti } = await payload.find({
    collection: 'hot-topics',
    where: {
      and: [
        { status: { equals: 'nuovo' } },
        {
          detectedAt: {
            greater_than_equal: new Date(
              adesso.getTime() - RICALCOLO_GIORNI * 86_400_000,
            ).toISOString(),
          },
        },
      ],
    },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })

  for (const a of aperti as unknown as ArgomentoSalvato[]) {
    if (daAggiornare.has(a.id)) continue
    const punteggio = calcolaPunteggio(
      (a.references ?? []).map((r) => perPunteggio({ ...r, source: idDi(r.source) })),
      a.summary ?? '',
      criteri,
      pesoFonte,
      adesso,
    )
    if (Math.abs(punteggio - Number(a.score ?? 0)) < 0.5) continue
    await payload.update({
      collection: 'hot-topics',
      id: a.id,
      overrideAccess: true,
      data: { score: punteggio },
    })
  }

  const vecchie = await payload.delete({
    collection: 'news-items',
    where: {
      publishedAt: {
        less_than: new Date(adesso.getTime() - CONSERVAZIONE_GIORNI * 86_400_000).toISOString(),
      },
    },
    overrideAccess: true,
  })
  esito.notizieCancellate = vecchie.docs.length

  return esito
}
