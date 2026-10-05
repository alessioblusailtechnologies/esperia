'use server'

import { revalidatePath } from 'next/cache'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { generaBozza } from '@/lib/ai/genera'
import { creaBozzaDaProposta } from '@/lib/ai/creaBozza'
import { leggiConfigurazione } from '@/lib/ai/client'
import { rilevaHotTopic } from '@/lib/hotTopic/rileva'
import { redattoreCorrente } from '@/lib/sessioneRedazione'

/**
 * Azioni dell'assistente per il backoffice — RF-AI-04, RF-AI-05, RF-AI-08.
 *
 * Il flusso è uno solo, quello della finestra «Nuovo articolo»: la redazione
 * dice da dove partire (i propri appunti o un hot topic), l'AI scrive e la
 * bozza si apre subito nell'editor, a nome di chi l'ha chiesta.
 *
 * Prima c'era una pagina intermedia con la proposta da «accettare» campo per
 * campo, ma l'accettazione non aveva effetto e il testo andava corretto due
 * volte. La revisione umana ora sta dove si scrive: i punti da verificare
 * viaggiano con l'articolo come promemoria, e l'approvazione resta all'Editor
 * nel workflow (HITL).
 *
 * Come per la moderazione, ogni azione verifica sessione e ruolo per conto
 * proprio: una server action è un endpoint pubblico a tutti gli effetti.
 */

type Esito<T> = { ok: true; dati: T } | { ok: false; messaggio: string }

const PARAGRAFI_PER_LUNGHEZZA: Record<string, number> = {
  breve: 4,
  media: 7,
  lunga: 12,
}

/* -------------------------------------------------------------------------- */
/* Dati per la finestra «Nuovo articolo»                                      */
/* -------------------------------------------------------------------------- */

export interface ArgomentoBreve {
  id: string
  titolo: string
  fonti: number
  testate: string[]
  categoriaId: string | null
}

export interface DatiNuovoArticolo {
  aiAttiva: boolean
  motivoAiSpenta: string | null
  categorie: Array<{ id: string; nome: string }>
  argomenti: ArgomentoBreve[]
}

export async function datiNuovoArticolo(): Promise<Esito<DatiNuovoArticolo>> {
  const sessione = await redattoreCorrente()
  if (!sessione.ok) return sessione

  const payload = await getPayload({ config })
  const conf = await leggiConfigurazione(payload)

  const [cats, topics] = await Promise.all([
    payload.find({ collection: 'categories', limit: 50, sort: 'order', overrideAccess: true }),
    payload.find({
      collection: 'hot-topics',
      where: { status: { equals: 'nuovo' } },
      sort: '-score',
      limit: 8,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  return {
    ok: true,
    dati: {
      aiAttiva: conf.enabled,
      motivoAiSpenta: conf.enabled ? null : conf.disabledMessage,
      categorie: cats.docs.map((c) => {
        const x = c as unknown as { id: string; name: string }
        return { id: String(x.id), nome: x.name }
      }),
      argomenti: topics.docs.map((d) => {
        const t = d as unknown as {
          id: string
          title: string
          suggestedCategory?: string | null
          references?: Array<{ publisher?: string | null }> | null
        }
        const testate = [
          ...new Set((t.references ?? []).map((r) => r.publisher).filter(Boolean) as string[]),
        ]
        return {
          id: String(t.id),
          titolo: t.title,
          fonti: t.references?.length ?? 0,
          testate,
          categoriaId: t.suggestedCategory ? String(t.suggestedCategory) : null,
        }
      }),
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Bozza scritta dall'AI — RF-AI-04 (hot topic) e RF-AI-05 (appunti)          */
/* -------------------------------------------------------------------------- */

export interface RichiestaBozzaAi {
  partenza: 'appunti' | 'hot_topic'
  /** Gli appunti del redattore, o le indicazioni facoltative per un hot topic. */
  testo?: string
  hotTopicId?: string
  categoriaId?: string | null
  lunghezza?: string
  taglio?: string | null
}

export async function scriviBozzaAi(
  input: RichiestaBozzaAi,
): Promise<Esito<{ urlModifica: string }>> {
  const sessione = await redattoreCorrente()
  if (!sessione.ok) return sessione

  const payload = await getPayload({ config })
  const conf = await leggiConfigurazione(payload)
  const testo = (input.testo ?? '').trim()
  const taglio = input.taglio ? `\n\nTaglio richiesto: ${input.taglio}.` : ''
  const lunghezzaParagrafi = PARAGRAFI_PER_LUNGHEZZA[input.lunghezza ?? 'media'] ?? 7

  let contesto: string
  let fonti: Array<{ titolo: string; url: string; testata?: string }> | undefined
  let categoriaId = input.categoriaId ?? null

  if (input.partenza === 'appunti') {
    if (testo.length < 20) {
      return {
        ok: false,
        messaggio: 'Gli appunti sono troppo scarni: scrivi almeno il fatto e il contesto.',
      }
    }
    contesto = testo + taglio
  } else {
    if (!input.hotTopicId) return { ok: false, messaggio: 'Scegli un argomento.' }

    let topic: Record<string, any>
    try {
      topic = (await payload.findByID({
        collection: 'hot-topics',
        id: input.hotTopicId,
        depth: 0,
        overrideAccess: true,
      })) as Record<string, any>
    } catch {
      return { ok: false, messaggio: 'Argomento non trovato: forse è stato scartato.' }
    }

    contesto = [
      `Argomento: ${topic.title}`,
      topic.summary ? `\nSintesi delle fonti: ${topic.summary}` : '',
      Array.isArray(topic.keywords) && topic.keywords.length
        ? `\nParole chiave ricorrenti: ${topic.keywords.join(', ')}`
        : '',
      testo ? `\n\nIndicazioni del redattore: ${testo}` : '',
      taglio,
    ].join('')

    fonti = (topic.references ?? []).map((r: Record<string, any>) => ({
      titolo: String(r.title ?? ''),
      url: String(r.url ?? ''),
      testata: r.publisher ? String(r.publisher) : undefined,
    }))

    categoriaId ??= topic.suggestedCategory ? String(topic.suggestedCategory) : null
  }

  const esito = await generaBozza(
    { payload, utenteId: sessione.utente.id },
    { contesto, fonti, lunghezzaParagrafi },
    input.partenza === 'appunti' ? 'draft_from_brief' : 'draft_from_topic',
  )
  if (!esito.ok) return { ok: false, messaggio: esito.messaggio }

  try {
    const creato = await creaBozzaDaProposta({
      payload,
      utenteId: sessione.utente.id,
      proposta: esito.dati,
      categoriaId,
      hotTopicId: input.partenza === 'hot_topic' ? (input.hotTopicId ?? null) : null,
      brief: testo || null,
      modello: conf.textModel,
    })
    if (!creato.ok) return creato

    revalidatePath('/admin/hot-topic')
    return { ok: true, dati: { urlModifica: creato.dati.urlModifica } }
  } catch (err) {
    return { ok: false, messaggio: `Creazione della bozza fallita: ${(err as Error).message}` }
  }
}

/* -------------------------------------------------------------------------- */
/* Scarto di un argomento — RF-AI-03 (taratura della rilevanza)               */
/* -------------------------------------------------------------------------- */

export async function scartaHotTopic(id: string, motivo: string): Promise<Esito<null>> {
  const sessione = await redattoreCorrente()
  if (!sessione.ok) return sessione

  const payload = await getPayload({ config })

  try {
    await payload.update({
      collection: 'hot-topics',
      id,
      overrideAccess: true,
      // Il motivo non è burocrazia: se scartiamo sempre lo stesso genere di
      // argomenti, è la configurazione della rilevanza che va corretta.
      data: { status: 'scartato', discardReason: motivo || null } as never,
    })
    revalidatePath('/admin/hot-topic')
    return { ok: true, dati: null }
  } catch (err) {
    return { ok: false, messaggio: (err as Error).message }
  }
}

/* -------------------------------------------------------------------------- */
/* Ricerca manuale degli hot topic — RF-AI-02                                 */
/* -------------------------------------------------------------------------- */

export interface EsitoRicerca {
  fontiLette: number
  fontiInErrore: number
  notizieNuove: number
  argomentiCreati: number
  argomentiAggiornati: number
}

/**
 * Lancia subito il rilevamento che il job fa da solo ogni 5 minuti, leggendo
 * tutte le fonti attive anche se non è passato il loro intervallo. Serve
 * quando in redazione arriva una notizia e non si vuole aspettare il giro.
 */
export async function cercaHotTopicOra(): Promise<Esito<EsitoRicerca>> {
  const sessione = await redattoreCorrente()
  if (!sessione.ok) return sessione

  const payload = await getPayload({ config })

  try {
    const esito = await rilevaHotTopic(payload, new Date(), { forza: true })
    if (esito.saltato) return { ok: false, messaggio: esito.saltato }

    revalidatePath('/admin/hot-topic')
    return {
      ok: true,
      dati: {
        fontiLette: esito.fontiLette,
        fontiInErrore: esito.fontiInErrore,
        notizieNuove: esito.notizieNuove,
        argomentiCreati: esito.argomentiCreati,
        argomentiAggiornati: esito.argomentiAggiornati,
      },
    }
  } catch (err) {
    return { ok: false, messaggio: `Ricerca non riuscita: ${(err as Error).message}` }
  }
}

