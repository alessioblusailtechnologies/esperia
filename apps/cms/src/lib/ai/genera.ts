import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import type { Payload } from 'payload'
import type { AiOperation } from '@esperia/shared'
import { ottieniClient, stimaCostoEur, type ConfigurazioneAi, type EsitoAi } from './client'

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

const SchemaBozza = z.object({
  titolo: z.string().describe('Titolo giornalistico, massimo 90 caratteri, senza sensazionalismo'),
  occhiello: z.string().describe('Sovratitolo di contesto, massimo 60 caratteri'),
  sommario: z.string().describe('Sommario di 2-3 frasi che risponde a chi, cosa, quando, dove'),
  paragrafi: z
    .array(z.string())
    .describe('Corpo dell articolo diviso in paragrafi. Il primo e l attacco'),
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

function istruzioniDiSistema(config: ConfigurazioneAi): string {
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

interface DatiConsumo {
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

async function registraConsumo(
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
  /** Fonti da citare, quando la bozza nasce da un hot topic. */
  fonti?: Array<{ titolo: string; url: string; testata?: string }>
  lunghezzaParagrafi?: number
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
  const avvio = Date.now()

  const fonti = (richiesta.fonti ?? [])
    .map((f, i) => `[${i + 1}] ${f.titolo}${f.testata ? ` (${f.testata})` : ''} — ${f.url}`)
    .join('\n')

  const messaggio = [
    richiesta.contesto,
    fonti ? `\n\nFonti disponibili:\n${fonti}` : '',
    `\n\nProduci una bozza di circa ${richiesta.lunghezzaParagrafi ?? 6} paragrafi.`,
    fonti
      ? '\nAttieniti ai fatti presenti nelle fonti. Tutto ciò che non vi compare va nei punti da verificare.'
      : '\nIl brief è l unica fonte: segnala fra i punti da verificare ogni elemento che manca per un articolo pubblicabile.',
  ].join('')

  try {
    const risposta = await client.messages.parse({
      model,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: config.effort,
        format: zodOutputFormat(SchemaBozza),
      },
      system: istruzioniDiSistema(config),
      messages: [{ role: 'user', content: messaggio }],
    })

    const durata = Date.now() - avvio

    // Il modello può rifiutare: va detto al redattore, non nascosto.
    if (risposta.stop_reason === 'refusal') {
      await registraConsumo(payload, config, {
        operation: operazione,
        model,
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
      model,
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
 * Trasforma i paragrafi generati nella struttura che l'editor si aspetta.
 * Senza questo passaggio la bozza arriverebbe nel campo come testo grezzo e
 * il redattore dovrebbe reimpaginarla a mano.
 */
type DocumentoLexical = {
  [k: string]: unknown
  root: {
    type: string
    children: Array<{ [k: string]: unknown; type: string; version: number }>
    direction: 'ltr' | 'rtl' | null
    format: '' | 'left' | 'start' | 'center' | 'right' | 'end' | 'justify'
    indent: number
    version: number
  }
}

export function bozzaInLexical(paragrafi: string[]): DocumentoLexical {
  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr',
      children: paragrafi.map((testo) => ({
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: 'ltr',
        textFormat: 0,
        children: [
          {
            type: 'text',
            text: testo,
            format: 0,
            style: '',
            mode: 'normal',
            detail: 0,
            version: 1,
          },
        ],
      })),
    },
  }
}
