import { randomBytes } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import type { Payload } from 'payload'
import type { AiOperation } from '@esperia/shared'
import {
  PARACADUTE_RIFIUTO,
  ottieniClient,
  parametriRagionamento,
  stimaCostoEur,
  type ConfigurazioneAi,
  type EsitoAi,
} from './client'
import { materialeInTesto, type FonteMateriale } from './materiale'

/**
 * Generazione assistita di bozze — RF-AI-04, RF-AI-05, RF-AI-08.
 *
 * Principio non negoziabile: l'output di questo modulo diventa SEMPRE una
 * bozza attribuita al redattore che l'ha richiesta. Non esiste un percorso,
 * in tutto il codice, che porti un testo generato direttamente in pubblicazione.
 * Il vincolo e' ribadito nell'hook enforceWorkflow, cosi' vale anche per
 * chiamate future che dimenticassero questa regola.
 */

/* -------------------------------------------------------------------------- */
/* Forma dell'output                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Il corpo arriva a blocchi tipizzati, non come paragrafi di testo piano: è
 * ciò che permette titoletti, citazioni in evidenza, elenchi e grassetti
 * nella bozza (vedi bozzaInLexical).
 */
const SchemaBlocco = z.object({
  tipo: z.enum(['paragrafo', 'titoletto', 'citazione', 'elenco']),
  testo: z
    .string()
    .describe(
      'paragrafo: il testo, con **grassetto** e *corsivo* in markdown dove servono; ' +
        'titoletto: il titoletto, senza markdown; citazione: le parole testuali, senza virgolette; ' +
        'elenco: una frase che introduce l elenco, o vuoto',
    ),
  attribuzione: z
    .string()
    .describe(
      'Solo per citazione: chi l ha detta e il ruolo (es. «Giuseppe Valditara, ministro dell Istruzione»). Vuoto negli altri casi',
    ),
  voci: z
    .array(z.string())
    .describe(
      'Solo per elenco: da 3 a 6 voci brevi, con **grassetto** sull inizio se utile. Vuoto negli altri casi',
    ),
})

export type BloccoBozza = z.infer<typeof SchemaBlocco>

const SchemaBozza = z.object({
  titolo: z.string().describe('Titolo giornalistico, massimo 90 caratteri, senza sensazionalismo'),
  occhiello: z.string().describe('Sovratitolo di contesto, massimo 60 caratteri'),
  sommario: z.string().describe('Sommario di 2-3 frasi che risponde a chi, cosa, quando, dove'),
  corpo: z
    .array(SchemaBlocco)
    .describe(
      'Il corpo dell articolo a blocchi, nell ordine di lettura. Il primo blocco è l attacco',
    ),
  tagSuggeriti: z.array(z.string()).describe('Da 3 a 6 tag in minuscolo'),
  titoliAlternativi: z.array(z.string()).describe('Due titoli alternativi fra cui scegliere'),
  metaDescription: z.string().describe('Meta description SEO, massimo 155 caratteri'),
  puntiDaVerificare: z
    .array(z.string())
    .describe(
      'Affermazioni del testo che il redattore deve verificare prima di pubblicare, o fatti che mancano',
    ),
})

export type BozzaGenerata = z.infer<typeof SchemaBozza>

/* -------------------------------------------------------------------------- */
/* Prompt                                                                     */
/* -------------------------------------------------------------------------- */

export function istruzioniDiSistema(config: ConfigurazioneAi): string {
  const parti = [
    'Sei un assistente di redazione per una testata giornalistica italiana.',
    'Scrivi bozze che un redattore umano rivedrà, verificherà e firmerà.',
    '',
    'Regole di scrittura:',
    '- Italiano corretto, registro sobrio, periodi brevi.',
    '- L attacco risponde subito a chi, cosa, quando, dove.',
    '- Nessun aggettivo valutativo e nessun sensazionalismo.',
    '- Non inventare MAI dichiarazioni, cifre, nomi o date.',
    '- Se un elemento non è presente nelle fonti fornite, non scriverlo: elencalo',
    '  invece fra i punti da verificare.',
    '- Non usare formule da intelligenza artificiale ("in conclusione", "è importante notare").',
  ]

  if (config.editorialProfile) {
    parti.push('', 'Linea editoriale della testata:', config.editorialProfile)
  }

  if (config.toneOfVoice) {
    parti.push('', 'Indicazioni di stile:', config.toneOfVoice)
  }

  if (config.themes.length > 0) {
    parti.push('', `Ambiti di interesse: ${config.themes.join(', ')}.`)
  }

  return parti.join('\n')
}

/* -------------------------------------------------------------------------- */
/* Registro consumi — RF-AI-10                                                */
/* -------------------------------------------------------------------------- */

export interface DatiConsumo {
  operation: AiOperation
  model: string
  inputTokens: number
  outputTokens: number
  durationMs: number
  success: boolean
  errorMessage?: string
  userId?: string | null
  articleId?: string | null
}

export async function registraConsumo(
  payload: Payload,
  config: ConfigurazioneAi,
  d: DatiConsumo,
): Promise<void> {
  try {
    await payload.create({
      collection: 'ai-usage',
      overrideAccess: true,
      data: {
        provider: 'anthropic',
        model: d.model,
        operation: d.operation,
        inputTokens: d.inputTokens,
        outputTokens: d.outputTokens,
        totalTokens: d.inputTokens + d.outputTokens,
        estimatedCostEur: stimaCostoEur(config, d.model, d.inputTokens, d.outputTokens),
        durationMs: d.durationMs,
        success: d.success,
        errorMessage: d.errorMessage,
        user: d.userId ?? undefined,
        article: d.articleId ?? undefined,
      },
    })
  } catch (err) {
    // Il registro non deve far fallire la generazione che sta tracciando.
    payload.logger.error(`Registrazione consumo AI fallita: ${(err as Error).message}`)
  }
}

/* -------------------------------------------------------------------------- */
/* Generazione                                                                */
/* -------------------------------------------------------------------------- */

export interface RichiestaBozza {
  /** Testo di partenza: il brief del redattore (RF-AI-05) o la sintesi di un hot topic (RF-AI-04). */
  contesto: string
  /** Il materiale delle fonti, quando la bozza nasce da un hot topic (vedi materiale.ts). */
  fonti?: FonteMateriale[]
  /** Lunghezza indicativa del corpo, in parole. */
  parole?: number
  /** Uno dei tagli proposti nella finestra «Nuovo articolo», se scelto. */
  taglio?: string | null
}

/**
 * Come si impagina un pezzo. Sono le regole che un caporedattore darebbe a
 * un collaboratore: senza, il modello scrive paragrafi tutti uguali.
 */
const IMPAGINAZIONE = [
  'Come impaginare il corpo:',
  '- Attacco: un paragrafo di 2-3 frasi con il fatto principale; il dato o il nome decisivo in **grassetto**.',
  '- Paragrafi di 2-4 frasi, uno per idea. Alterna frasi brevi e frasi più articolate.',
  '- Grassetto solo su nomi propri, cifre e decisioni chiave, alla prima occorrenza: al massimo uno per paragrafo e 4-5 in tutto il pezzo. Corsivo per titoli di opere, termini stranieri, nomi di campagne.',
  '- Titoletti: dai 500 parole in su, uno ogni 3-4 paragrafi, brevi (massimo 6 parole) e informativi, non domande né giochi di parole. Sotto le 500 parole, nessun titoletto.',
  '- Citazione in evidenza: se nelle fonti c è una dichiarazione testuale significativa, riportala in un blocco «citazione», con le parole esatte della fonte e l attribuzione completa. Al massimo due. Mai citazioni ricostruite, parafrasate o attribuite per deduzione: se non è testuale nelle fonti, non è una citazione.',
  '- Elenco: solo quando il contenuto è davvero una serie (misure di un provvedimento, date, cifre a confronto, richieste di una piattaforma). Al massimo uno.',
  '- Chiusura: un paragrafo di contesto o di prospettiva (prossimi passaggi, date, cosa resta aperto), senza morale e senza riassunto.',
  '- Le dichiarazioni brevi possono stare nel testo, tra virgolette basse «…», sempre con chi le ha dette.',
].join('\n')

const STRUTTURA_PER_TAGLIO: Record<string, string> = {
  'Cronaca dei fatti':
    'Ordine: fatto, dettagli in ordine di importanza, testimonianze o dichiarazioni, contesto, prossimi passaggi.',
  'Che cosa cambia':
    'Ordine: la novità in una frase, poi un elenco delle misure o dei cambiamenti concreti, chi riguarda, da quando, cosa resta da definire.',
  'Analisi e contesto':
    'Ordine: il fatto in breve, poi titoletti che spiegano antefatti, posizioni in campo e conseguenze. Meno cronaca, più spiegazione, sempre ancorata alle fonti.',
  'Le reazioni':
    'Ordine: il fatto in breve, poi le reazioni raggruppate per schieramento o categoria, con le citazioni testuali disponibili e l attribuzione completa.',
}

/**
 * Chi ha chiesto la generazione. Non passiamo l'intera PayloadRequest perche'
 * questa funzione viene invocata anche da server action, dove una request di
 * Payload non esiste: servono solo il client e l'utente da attribuire.
 */
export interface ContestoGenerazione {
  payload: Payload
  utenteId?: string | null
}

export async function generaBozza(
  ctx: ContestoGenerazione,
  richiesta: RichiestaBozza,
  operazione: 'draft_from_topic' | 'draft_from_brief',
): Promise<EsitoAi<BozzaGenerata>> {
  const payload = ctx.payload
  const accesso = await ottieniClient(payload)

  if (!accesso.ok) {
    return { ok: false, motivo: accesso.motivo, messaggio: accesso.messaggio }
  }

  const { client, config } = accesso
  const model = config.textModel
  const ragionamento = parametriRagionamento(model, config.effort)
  const avvio = Date.now()

  const fonti = richiesta.fonti?.length ? materialeInTesto(richiesta.fonti) : ''
  const parole = richiesta.parole ?? 700
  const struttura = richiesta.taglio ? STRUTTURA_PER_TAGLIO[richiesta.taglio] : undefined

  const messaggio = [
    richiesta.contesto,
    fonti ? `\n\nMateriale delle fonti:\n\n${fonti}` : '',
    `\n\nScrivi una bozza di circa ${parole} parole di corpo.`,
    richiesta.taglio
      ? `\nTaglio: ${richiesta.taglio}. ${struttura ?? ''}`
      : '\nTaglio: scegli quello che il materiale sostiene meglio, di norma la cronaca dei fatti.',
    `\n\n${IMPAGINAZIONE}`,
    fonti
      ? [
          '\n\nUso delle fonti:',
          '\n- Attieniti ai fatti presenti nel materiale; usa tutti i dettagli concreti che contiene (nomi, ruoli, cifre, date, luoghi).',
          '\n- Rielabora con parole tue: a parte le citazioni dichiarate, non riprendere frasi delle fonti.',
          '\n- Se le fonti divergono su un dato, scrivi la versione più prudente e segnala la divergenza fra i punti da verificare.',
          '\n- Ciò che manca e servirebbe al pezzo va nei punti da verificare, che restano pochi e concreti (massimo 6).',
          '\n- Il testo è per i lettori: non parlare mai delle fonti o del materiale («le fonti non indicano», «non è noto dalle informazioni disponibili»). Se un elemento manca, il pezzo semplicemente non lo dice; al massimo «non è stato reso noto» quando l assenza è essa stessa una notizia.',
        ].join('')
      : '\n\nIl brief è l unica fonte: segnala fra i punti da verificare (massimo 6) ogni elemento che manca per un articolo pubblicabile.',
  ].join('')

  try {
    // Endpoint beta per il paracadute in caso di rifiuto (vedi PARACADUTE_RIFIUTO).
    const risposta = await client.beta.messages.parse({
      ...PARACADUTE_RIFIUTO,
      model,
      max_tokens: 16000,
      ...(ragionamento.thinking ? { thinking: ragionamento.thinking } : {}),
      output_config: {
        ...(ragionamento.effort ? { effort: ragionamento.effort } : {}),
        format: betaZodOutputFormat(SchemaBozza),
      },
      system: istruzioniDiSistema(config),
      messages: [{ role: 'user', content: messaggio }],
    })

    const durata = Date.now() - avvio

    // Il modello può rifiutare: va detto al redattore, non nascosto.
    if (risposta.stop_reason === 'refusal') {
      await registraConsumo(payload, config, {
        operation: operazione,
        // Il modello che ha risposto davvero: dopo un rifiuto può essere quello di riserva.
        model: risposta.model ?? model,
        inputTokens: risposta.usage.input_tokens,
        outputTokens: risposta.usage.output_tokens,
        durationMs: durata,
        success: false,
        errorMessage: `refusal: ${risposta.stop_details?.category ?? 'sconosciuto'}`,
        userId: ctx.utenteId ?? null,
      })

      return {
        ok: false,
        motivo: 'rifiutato',
        messaggio:
          'Il modello ha rifiutato di elaborare questa richiesta. Riformula il brief o procedi manualmente.',
      }
    }

    await registraConsumo(payload, config, {
      operation: operazione,
      model: risposta.model ?? model,
      inputTokens: risposta.usage.input_tokens,
      outputTokens: risposta.usage.output_tokens,
      durationMs: durata,
      success: true,
      userId: ctx.utenteId ?? null,
    })

    if (!risposta.parsed_output) {
      return {
        ok: false,
        motivo: 'errore',
        messaggio: 'La risposta del modello non era nel formato atteso. Riprova.',
      }
    }

    return { ok: true, dati: risposta.parsed_output }
  } catch (err) {
    const durata = Date.now() - avvio
    const messaggioErrore = (err as Error).message

    await registraConsumo(payload, config, {
      operation: operazione,
      model,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: durata,
      success: false,
      errorMessage: messaggioErrore,
      userId: ctx.utenteId ?? null,
    })

    payload.logger.error(`Generazione AI fallita: ${messaggioErrore}`)

    if (err instanceof Anthropic.RateLimitError) {
      return {
        ok: false,
        motivo: 'errore',
        messaggio: 'Troppe richieste in corso verso il provider AI. Riprova fra un minuto.',
      }
    }

    if (err instanceof Anthropic.AuthenticationError) {
      return {
        ok: false,
        motivo: 'non_configurato',
        messaggio: 'La chiave API configurata non è valida. Verificarla in Impostazioni AI.',
      }
    }

    return {
      ok: false,
      motivo: 'errore',
      messaggio: 'Il servizio AI non è al momento raggiungibile. Riprova più tardi.',
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Conversione in documento Lexical                                           */
/* -------------------------------------------------------------------------- */

/**
 * Trasforma il corpo generato nella struttura che l'editor si aspetta: un
 * paragrafo per stringa (le bozze di prova e i seed) o i blocchi tipizzati
 * dello schema, con grassetti, titoletti, elenchi e il blocco Citazione.
 * Senza questo passaggio la bozza arriverebbe nel campo come testo grezzo e
 * il redattore dovrebbe reimpaginarla a mano.
 */
type NodoLexical = { [k: string]: unknown; type: string; version: number }

type DocumentoLexical = {
  [k: string]: unknown
  root: {
    type: string
    children: NodoLexical[]
    direction: 'ltr' | 'rtl' | null
    format: '' | 'left' | 'start' | 'center' | 'right' | 'end' | 'justify'
    indent: number
    version: number
  }
}

const GRASSETTO = 1
const CORSIVO = 2

/** `**grassetto**` e `*corsivo*` in nodi di testo; il resto resta com'è. */
function testoFormattato(testo: string): NodoLexical[] {
  const nodi: NodoLexical[] = []
  for (const pezzo of testo.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/)) {
    if (!pezzo) continue
    const grassetto = pezzo.startsWith('**') && pezzo.endsWith('**') && pezzo.length > 4
    const corsivo = !grassetto && pezzo.startsWith('*') && pezzo.endsWith('*') && pezzo.length > 2
    nodi.push({
      type: 'text',
      text: grassetto ? pezzo.slice(2, -2) : corsivo ? pezzo.slice(1, -1) : pezzo,
      format: grassetto ? GRASSETTO : corsivo ? CORSIVO : 0,
      style: '',
      mode: 'normal',
      detail: 0,
      version: 1,
    })
  }
  return nodi
}

const ELEMENTO = { format: '', indent: 0, version: 1, direction: 'ltr' } as const

function paragrafo(testo: string): NodoLexical {
  return { type: 'paragraph', ...ELEMENTO, textFormat: 0, children: testoFormattato(testo) }
}

function nodiDelBlocco(b: BloccoBozza): NodoLexical[] {
  const testo = b.testo.trim()
  switch (b.tipo) {
    case 'titoletto':
      return testo
        ? [
            {
              type: 'heading',
              tag: 'h2',
              ...ELEMENTO,
              children: testoFormattato(testo.replace(/\*/g, '')),
            },
          ]
        : []
    case 'citazione':
      return testo
        ? [
            {
              type: 'block',
              version: 2,
              format: '',
              fields: {
                id: randomBytes(12).toString('hex'),
                blockName: '',
                blockType: 'quote',
                text: testo.replace(/^[«"“]+|[»"”]+$/g, '').trim(),
                attribution: b.attribuzione.trim(),
              },
            },
          ]
        : []
    case 'elenco': {
      const voci = b.voci.map((v) => v.trim()).filter(Boolean)
      if (!voci.length) return testo ? [paragrafo(testo)] : []
      const elenco: NodoLexical = {
        type: 'list',
        listType: 'bullet',
        tag: 'ul',
        start: 1,
        ...ELEMENTO,
        children: voci.map((v, i) => ({
          type: 'listitem',
          value: i + 1,
          ...ELEMENTO,
          children: testoFormattato(v),
        })),
      }
      return testo ? [paragrafo(testo), elenco] : [elenco]
    }
    default:
      return testo ? [paragrafo(testo)] : []
  }
}

export function bozzaInLexical(corpo: Array<string | BloccoBozza>): DocumentoLexical {
  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr',
      children: corpo.flatMap((b) => (typeof b === 'string' ? [paragrafo(b)] : nodiDelBlocco(b))),
    },
  }
}
