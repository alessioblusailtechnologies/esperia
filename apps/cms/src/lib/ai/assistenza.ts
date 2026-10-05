import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import type { Payload } from 'payload'
import type { AiOperation } from '@esperia/shared'
import { PARACADUTE_RIFIUTO, ottieniClient, parametriRagionamento, type EsitoAi } from './client'
import { istruzioniDiSistema, registraConsumo } from './genera'

/**
 * Assistenza all'editing su un testo esistente — RF-AI-06, RF-AI-08.
 *
 * Diversa dalla generazione da zero: qui il redattore ha gia' scritto, e
 * l'assistente lavora su un passaggio (riscrittura, sintesi) o sull'articolo
 * intero (titoli alternativi, suggerimenti SEO), oppure esegue una richiesta
 * scritta a parole dal redattore (istruzione libera), proponendo modifiche a
 * singoli blocchi del corpo e ai campi d'intestazione. Non scrive mai nel documento:
 * restituisce una proposta che la barra mostra accanto al testo attuale, e
 * che entra nell'articolo solo se il redattore la accetta.
 *
 * Riscrittura e sintesi usano il modello per i testi, perche' il risultato
 * finisce nel pezzo. Anche i suggerimenti SEO: sono osservazioni da verificare
 * sul testo, e nella prova reale il modello di servizio ne sbagliava meta'
 * (dichiarava assente cio' che l'attacco conteneva). I titoli alternativi
 * restano al modello di servizio: sono proposte brevi da scegliere.
 */

export type Strumento = 'riscrivi' | 'sintetizza' | 'titoli' | 'seo' | 'istruzione'

/** Oltre questa lunghezza la richiesta libera del redattore non viene inviata. */
export const ISTRUZIONE_MAX = 2_000

/** Oltre questa lunghezza l'articolo non viene inviato: meglio dirlo che tagliarlo in silenzio. */
export const TESTO_MAX = 60_000

const SchemaTesto = z.object({
  testo: z.string().describe('Il testo proposto, pronto da sostituire a quello originale'),
})

const SchemaTitoli = z.object({
  titoli: z.array(z.string()).describe('Esattamente tre titoli alternativi'),
})

const SchemaSeo = z.object({
  metaTitle: z.string().describe('Meta title proposto, al massimo 60 caratteri'),
  metaDescription: z.string().describe('Meta description proposta, fra 120 e 155 caratteri'),
  suggerimenti: z
    .array(z.string())
    .describe('Da 2 a 4 osservazioni concrete e verificabili sul contenuto, una frase ciascuna'),
})

/** I campi d'intestazione che l'istruzione libera puo' proporre di cambiare. */
export const CAMPI_ISTRUZIONE = [
  'occhiello',
  'titolo',
  'sottotitolo',
  'sommario',
  'metaTitle',
  'metaDescription',
] as const
export type CampoIstruzione = (typeof CAMPI_ISTRUZIONE)[number]

const SchemaIstruzione = z.object({
  risposta: z
    .string()
    .describe(
      'Una o due frasi al redattore: cosa proponi e perché, oppure la risposta alla sua domanda',
    ),
  modifiche: z
    .array(
      z.object({
        azione: z.enum(['sostituisci', 'inserisci_dopo', 'elimina']),
        blocco: z
          .number()
          .int()
          .describe(
            'Numero del blocco del corpo su cui agire (0 = la selezione del redattore, se presente)',
          ),
        testo: z
          .string()
          .describe('Il nuovo testo del blocco, o del blocco da inserire; vuoto per elimina'),
      }),
    )
    .describe('Le modifiche al corpo; nessuna se la richiesta è una domanda'),
  campi: z
    .array(z.object({ campo: z.enum(CAMPI_ISTRUZIONE), valore: z.string() }))
    .describe('I campi d’intestazione da cambiare; nessuno se la richiesta non li riguarda'),
})

export interface ModificaCorpo {
  azione: 'sostituisci' | 'inserisci_dopo' | 'elimina'
  blocco: number
  testo: string
}

/** Un blocco del corpo così come l'assistente lo vede: numerato, col suo tipo. */
export interface BloccoCorpo {
  n: number
  tipo: string
  testo: string
  modificabile: boolean
}

export type PropostaAssistente =
  | { strumento: 'riscrivi' | 'sintetizza'; testo: string }
  | { strumento: 'titoli'; titoli: string[] }
  | {
      strumento: 'seo'
      metaTitle: string
      metaDescription: string
      suggerimenti: string[]
    }
  | {
      strumento: 'istruzione'
      risposta: string
      modifiche: ModificaCorpo[]
      campi: Array<{ campo: CampoIstruzione; valore: string }>
    }

export interface RichiestaAssistente {
  strumento: Strumento
  /** Il passaggio su cui lavorare: la selezione nel corpo, o il primo paragrafo. */
  passaggio: string
  /** L'articolo intero in testo semplice: contesto per tutti, materia per titoli e SEO. */
  articolo: string
  titolo: string
  /** Solo per l'istruzione libera: cosa chiede il redattore, a parole sue. */
  istruzione?: string
  /** Solo per l'istruzione libera: il corpo diviso in blocchi numerati. */
  blocchi?: BloccoCorpo[]
  /** Solo per l'istruzione libera: i valori attuali dei campi d'intestazione. */
  campi?: Partial<Record<CampoIstruzione, string>>
}

const OPERAZIONE: Record<Strumento, AiOperation> = {
  riscrivi: 'rewrite',
  sintetizza: 'summarize',
  titoli: 'title_suggestions',
  seo: 'seo_suggestions',
  // Nel registro dei consumi l'istruzione libera conta come lavoro sul testo.
  istruzione: 'rewrite',
}

const NOMI_CAMPI: Record<CampoIstruzione, string> = {
  occhiello: 'Occhiello',
  titolo: 'Titolo',
  sottotitolo: 'Sottotitolo',
  sommario: 'Sommario',
  metaTitle: 'Meta title (max 60 caratteri)',
  metaDescription: 'Meta description (120-155 caratteri)',
}

function richiestaIstruzione(r: RichiestaAssistente): string {
  const campi = CAMPI_ISTRUZIONE.map(
    (c) => `${NOMI_CAMPI[c]} [${c}]: ${r.campi?.[c]?.trim() || '(vuoto)'}`,
  )
  const blocchi = (r.blocchi ?? []).map(
    (b) => `[${b.n}] (${b.tipo}${b.modificabile ? '' : ', non modificabile'}) ${b.testo}`,
  )
  return [
    'Campi d’intestazione:',
    ...campi,
    '',
    'Corpo, diviso in blocchi numerati:',
    ...(blocchi.length ? blocchi : ['(vuoto)']),
    ...(r.passaggio ? ['', `Selezione del redattore (blocco 0):\n${r.passaggio}`] : []),
    '',
    `Richiesta del redattore: ${r.istruzione}`,
    '',
    [
      'Esegui la richiesta con modifiche puntuali, senza riscrivere l’articolo intero.',
      r.passaggio
        ? 'C’è una selezione: se la richiesta riguarda il testo, agisci sul blocco 0 con «sostituisci».'
        : 'Per agire su un blocco usa il suo numero; «inserisci_dopo» col blocco 0 aggiunge in testa al corpo.',
      'Il testo di ogni blocco è testo semplice, senza markdown; un blocco per paragrafo.',
      'Non toccare i blocchi non modificabili. Mantieni fatti, cifre, nomi e citazioni:',
      'non aggiungere informazioni che non compaiono nell’articolo o nella richiesta.',
      'Se la richiesta è una domanda sul pezzo, rispondi in «risposta» senza modifiche.',
      'Se non si può fare con quello che c’è, dillo in «risposta» e non proporre nulla.',
    ].join(' '),
  ].join('\n')
}

function richiestaUtente(r: RichiestaAssistente): string {
  if (r.strumento === 'istruzione') return richiestaIstruzione(r)
  const contesto = `Titolo attuale: ${r.titolo || '(nessuno)'}\n\nArticolo:\n${r.articolo}`

  switch (r.strumento) {
    case 'riscrivi':
      return [
        contesto,
        `\n\nPassaggio da riscrivere:\n${r.passaggio}`,
        '\n\nRiscrivi solo il passaggio indicato, per renderlo più chiaro e scorrevole.',
        'Mantieni tutti i fatti, le cifre, i nomi e le citazioni; non aggiungere informazioni',
        'che non compaiono nell’articolo. Lunghezza simile all’originale, stesso registro.',
        'Restituisci il solo passaggio riscritto, senza commenti.',
      ].join(' ')
    case 'sintetizza':
      return [
        contesto,
        `\n\nPassaggio da sintetizzare:\n${r.passaggio}`,
        '\n\nSintetizza il passaggio indicato in circa un terzo della lunghezza, tenendo',
        'chi, cosa, quando, dove. Nessuna informazione che non sia nel passaggio.',
        'Restituisci la sola sintesi, senza commenti.',
      ].join(' ')
    case 'titoli':
      return [
        contesto,
        '\n\nProponi tre titoli alternativi per questo articolo, ciascuno di al massimo 90',
        'caratteri, sobri e fedeli al contenuto: niente domande retoriche, niente promesse',
        'che il testo non mantiene. Tre angolazioni diverse, non tre varianti della stessa frase.',
      ].join(' ')
    default:
      return [
        contesto,
        '\n\nProponi meta title e meta description per i motori di ricerca, fedeli al',
        'contenuto. Poi da 2 a 4 osservazioni sul testo utili alla sua trovabilità: per',
        'esempio la parola chiave principale assente dall’attacco, sottotitoli mancanti in',
        'un testo lungo, un termine tecnico che i lettori cercano con un altro nome. Solo',
        'osservazioni verificabili sul testo dato, nessun consiglio generico.',
      ].join(' ')
  }
}

export async function proponiAssistenza(
  payload: Payload,
  utenteId: string,
  r: RichiestaAssistente,
): Promise<EsitoAi<PropostaAssistente>> {
  const accesso = await ottieniClient(payload)
  if (!accesso.ok) return { ok: false, motivo: accesso.motivo, messaggio: accesso.messaggio }

  const { client, config } = accesso
  const sulTesto = r.strumento === 'riscrivi' || r.strumento === 'sintetizza'
  const libera = r.strumento === 'istruzione'
  const model = r.strumento === 'titoli' ? config.utilityModel : config.textModel
  // Un paragrafo da riscrivere non richiede la profondità di una bozza intera.
  const ragionamento = parametriRagionamento(model, sulTesto || libera ? 'medium' : 'low')
  const schema = libera
    ? SchemaIstruzione
    : sulTesto
      ? SchemaTesto
      : r.strumento === 'titoli'
        ? SchemaTitoli
        : SchemaSeo
  const operazione = OPERAZIONE[r.strumento]
  const avvio = Date.now()

  const consumo = (
    risposta: { usage: { input_tokens: number; output_tokens: number }; model?: string } | null,
    errore?: string,
  ) =>
    registraConsumo(payload, config, {
      operation: operazione,
      // Il modello che ha risposto davvero: dopo un rifiuto può essere quello di riserva.
      model: risposta?.model ?? model,
      inputTokens: risposta?.usage.input_tokens ?? 0,
      outputTokens: risposta?.usage.output_tokens ?? 0,
      durationMs: Date.now() - avvio,
      success: !errore,
      errorMessage: errore,
      userId: utenteId,
    })

  try {
    // Endpoint beta per il paracadute in caso di rifiuto (vedi PARACADUTE_RIFIUTO).
    const risposta = await client.beta.messages.parse({
      ...PARACADUTE_RIFIUTO,
      model,
      // L'istruzione libera può toccare molti paragrafi di un pezzo lungo.
      max_tokens: libera ? 16000 : 8000,
      ...(ragionamento.thinking ? { thinking: ragionamento.thinking } : {}),
      output_config: {
        ...(ragionamento.effort ? { effort: ragionamento.effort } : {}),
        format: betaZodOutputFormat(schema),
      },
      system: istruzioniDiSistema(config),
      messages: [{ role: 'user', content: richiestaUtente(r) }],
    })

    if (risposta.stop_reason === 'refusal') {
      await consumo(risposta, `refusal: ${risposta.stop_details?.category ?? 'sconosciuto'}`)
      return {
        ok: false,
        motivo: 'rifiutato',
        messaggio: 'Il modello ha rifiutato di elaborare questo testo. Prosegui manualmente.',
      }
    }

    await consumo(risposta)

    const dati = risposta.parsed_output as Record<string, unknown> | null
    if (!dati) {
      return {
        ok: false,
        motivo: 'errore',
        messaggio: 'La risposta del modello non era nel formato atteso. Riprova.',
      }
    }

    if (r.strumento === 'riscrivi' || r.strumento === 'sintetizza') {
      return { ok: true, dati: { strumento: r.strumento, testo: String(dati.testo).trim() } }
    }
    if (r.strumento === 'istruzione') {
      // Solo blocchi che esistono e si possono toccare; in testa si può sempre inserire.
      const ammessi = new Set((r.blocchi ?? []).filter((b) => b.modificabile).map((b) => b.n))
      const modifiche = (dati.modifiche as ModificaCorpo[]).filter(
        (m) =>
          ammessi.has(m.blocco) ||
          (m.blocco === 0 && (Boolean(r.passaggio) || m.azione === 'inserisci_dopo')),
      )
      return {
        ok: true,
        dati: {
          strumento: 'istruzione',
          risposta: String(dati.risposta).trim(),
          modifiche: modifiche.map((m) => ({ ...m, testo: String(m.testo).trim() })),
          campi: (dati.campi as Array<{ campo: CampoIstruzione; valore: string }>)
            .filter((c) => CAMPI_ISTRUZIONE.includes(c.campo))
            .map((c) => ({ campo: c.campo, valore: String(c.valore).trim() })),
        },
      }
    }
    if (r.strumento === 'titoli') {
      return {
        ok: true,
        dati: { strumento: 'titoli', titoli: (dati.titoli as string[]).slice(0, 3) },
      }
    }
    return {
      ok: true,
      dati: {
        strumento: 'seo',
        metaTitle: String(dati.metaTitle),
        metaDescription: String(dati.metaDescription),
        suggerimenti: (dati.suggerimenti as string[]).slice(0, 4),
      },
    }
  } catch (err) {
    await consumo(null, (err as Error).message)
    payload.logger.error(`Assistenza AI fallita: ${(err as Error).message}`)

    if (err instanceof Anthropic.AuthenticationError) {
      return {
        ok: false,
        motivo: 'non_configurato',
        messaggio: 'La chiave API configurata non è valida. Verificarla in Impostazioni AI.',
      }
    }
    if (err instanceof Anthropic.RateLimitError) {
      return {
        ok: false,
        motivo: 'errore',
        messaggio: 'Troppe richieste in corso verso il provider AI. Riprova fra un minuto.',
      }
    }
    return {
      ok: false,
      motivo: 'errore',
      messaggio: 'Il servizio AI non è al momento raggiungibile. Riprova più tardi.',
    }
  }
}
