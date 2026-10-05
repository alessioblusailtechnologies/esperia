import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import type { Payload } from 'payload'
import type { AiOperation } from '@esperia/shared'
import { ottieniClient, parametriRagionamento, type EsitoAi } from './client'
import { istruzioniDiSistema, registraConsumo } from './genera'

/**
 * Assistenza all'editing su un testo esistente — RF-AI-06, RF-AI-08.
 *
 * Diversa dalla generazione da zero: qui il redattore ha gia' scritto, e
 * l'assistente lavora su un passaggio (riscrittura, sintesi) o sull'articolo
 * intero (titoli alternativi, suggerimenti SEO). Non scrive mai nel documento:
 * restituisce una proposta che il pannello mostra accanto al testo attuale, e
 * che entra nell'articolo solo se il redattore la accetta.
 *
 * Riscrittura e sintesi usano il modello per i testi, perche' il risultato
 * finisce nel pezzo. Anche i suggerimenti SEO: sono osservazioni da verificare
 * sul testo, e nella prova reale il modello di servizio ne sbagliava meta'
 * (dichiarava assente cio' che l'attacco conteneva). I titoli alternativi
 * restano al modello di servizio: sono proposte brevi da scegliere.
 */

export type Strumento = 'riscrivi' | 'sintetizza' | 'titoli' | 'seo'

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

export type PropostaAssistente =
  | { strumento: 'riscrivi' | 'sintetizza'; testo: string }
  | { strumento: 'titoli'; titoli: string[] }
  | {
      strumento: 'seo'
      metaTitle: string
      metaDescription: string
      suggerimenti: string[]
    }

export interface RichiestaAssistente {
  strumento: Strumento
  /** Il passaggio su cui lavorare: la selezione nel corpo, o il primo paragrafo. */
  passaggio: string
  /** L'articolo intero in testo semplice: contesto per tutti, materia per titoli e SEO. */
  articolo: string
  titolo: string
}

const OPERAZIONE: Record<Strumento, AiOperation> = {
  riscrivi: 'rewrite',
  sintetizza: 'summarize',
  titoli: 'title_suggestions',
  seo: 'seo_suggestions',
}

function richiestaUtente(r: RichiestaAssistente): string {
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
    case 'seo':
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
  const model = r.strumento === 'titoli' ? config.utilityModel : config.textModel
  // Un paragrafo da riscrivere non richiede la profondità di una bozza intera.
  const ragionamento = parametriRagionamento(model, sulTesto ? 'medium' : 'low')
  const schema = sulTesto ? SchemaTesto : r.strumento === 'titoli' ? SchemaTitoli : SchemaSeo
  const operazione = OPERAZIONE[r.strumento]
  const avvio = Date.now()

  const consumo = (risposta: { usage: Anthropic.Usage } | null, errore?: string) =>
    registraConsumo(payload, config, {
      operation: operazione,
      model,
      inputTokens: risposta?.usage.input_tokens ?? 0,
      outputTokens: risposta?.usage.output_tokens ?? 0,
      durationMs: Date.now() - avvio,
      success: !errore,
      errorMessage: errore,
      userId: utenteId,
    })

  try {
    const risposta = await client.messages.parse({
      model,
      max_tokens: 8000,
      ...(ragionamento.thinking ? { thinking: ragionamento.thinking } : {}),
      output_config: {
        ...(ragionamento.effort ? { effort: ragionamento.effort } : {}),
        format: zodOutputFormat(schema),
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
