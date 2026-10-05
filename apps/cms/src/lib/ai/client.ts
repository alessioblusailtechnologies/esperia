import Anthropic from '@anthropic-ai/sdk'
import type { Payload } from 'payload'
import { tryDecryptSecret } from '@/lib/crypto'

/**
 * Accesso al provider AI — RF-AI-09, RNF-10.
 *
 * Due invarianti che valgono in tutto il modulo:
 *
 *  1. La chiave arriva dalle impostazioni cifrate in database (configurate
 *     dall'Amministratore) e solo in mancanza di quelle dalla variabile
 *     d'ambiente. E' intestata al Committente e non compare mai nei log.
 *
 *  2. Se l'AI non e' configurata o e' spenta, questo modulo restituisce un
 *     esito "non disponibile" invece di sollevare: RNF-10 impone che il resto
 *     della piattaforma continui a funzionare senza degradare.
 */

export interface ConfigurazioneAi {
  enabled: boolean
  textModel: string
  utilityModel: string
  effort: 'low' | 'medium' | 'high' | 'xhigh'
  editorialProfile: string
  themes: string[]
  boostKeywords: string[]
  excludeKeywords: string[]
  toneOfVoice: string
  minScore: number
  maxTopicsPerRun: number
  disabledMessage: string
  pricing: Array<{ model: string; inputPerMillion: number; outputPerMillion: number }>
  usdToEur: number
}

export type EsitoAi<T> =
  | { ok: true; dati: T }
  | { ok: false; motivo: 'disattivato' | 'non_configurato' | 'rifiutato' | 'errore'; messaggio: string }

const PREDEFINITI: ConfigurazioneAi = {
  enabled: false,
  textModel: 'claude-opus-5-5',
  utilityModel: 'claude-sonnet-5-5',
  effort: 'high',
  editorialProfile: '',
  themes: [],
  boostKeywords: [],
  excludeKeywords: [],
  toneOfVoice: '',
  minScore: 30,
  maxTopicsPerRun: 15,
  disabledMessage: 'Gli strumenti di assistenza AI non sono al momento disponibili.',
  pricing: [],
  usdToEur: 0.92,
}

/**
 * Modelli non più offerti in Impostazioni AI e il loro sostituto. Chi li aveva
 * scelti passa al successore subito, senza dover risalvare le impostazioni:
 * Haiku è stato sostituito da Sonnet 5.5 come modello di servizio.
 */
const MODELLI_SOSTITUITI: Record<string, string> = {
  'claude-opus-5': 'claude-opus-5-5',
  'claude-sonnet-5': 'claude-sonnet-5-5',
  'claude-haiku-4-5': 'claude-sonnet-5-5',
}

const modelloAttuale = (m: unknown, ripiego: string): string =>
  typeof m === 'string' && m ? (MODELLI_SOSTITUITI[m] ?? m) : ripiego

/**
 * Listino di riserva in USD per milione di token, usato quando la tabella in
 * Impostazioni AI non ha ancora una riga per il modello (es. dopo un cambio di
 * modello): senza, il registro consumi segnerebbe 0 €.
 */
const LISTINO_PREDEFINITO: ConfigurazioneAi['pricing'] = [
  { model: 'claude-opus-5-5', inputPerMillion: 4, outputPerMillion: 20 },
  { model: 'claude-sonnet-5-5', inputPerMillion: 2, outputPerMillion: 10 },
]

export async function leggiConfigurazione(payload: Payload): Promise<ConfigurazioneAi> {
  try {
    const g = (await payload.findGlobal({
      slug: 'ai-settings',
      overrideAccess: true,
      depth: 0,
    })) as Record<string, any>

    return {
      ...PREDEFINITI,
      enabled: Boolean(g.enabled),
      textModel: modelloAttuale(g.textModel, PREDEFINITI.textModel),
      utilityModel: modelloAttuale(g.utilityModel, PREDEFINITI.utilityModel),
      effort: g.effort ?? PREDEFINITI.effort,
      editorialProfile: g.editorialProfile ?? '',
      themes: Array.isArray(g.themes) ? g.themes : [],
      boostKeywords: Array.isArray(g.boostKeywords) ? g.boostKeywords : [],
      excludeKeywords: Array.isArray(g.excludeKeywords) ? g.excludeKeywords : [],
      toneOfVoice: g.toneOfVoice ?? '',
      minScore: Number(g.minScore ?? PREDEFINITI.minScore),
      maxTopicsPerRun: Number(g.maxTopicsPerRun ?? PREDEFINITI.maxTopicsPerRun),
      disabledMessage: g.disabledMessage ?? PREDEFINITI.disabledMessage,
      pricing: Array.isArray(g.pricing) ? g.pricing : [],
      usdToEur: Number(g.usdToEur ?? PREDEFINITI.usdToEur),
    }
  } catch {
    return PREDEFINITI
  }
}

/**
 * Restituisce il client, oppure il motivo per cui non e' utilizzabile.
 * Chi chiama deve gestire entrambi i casi: e' il punto in cui si realizza RNF-10.
 */
export async function ottieniClient(
  payload: Payload,
): Promise<
  | { ok: true; client: Anthropic; config: ConfigurazioneAi }
  | { ok: false; motivo: 'disattivato' | 'non_configurato'; messaggio: string }
> {
  const config = await leggiConfigurazione(payload)

  if (!config.enabled) {
    return { ok: false, motivo: 'disattivato', messaggio: config.disabledMessage }
  }

  // La chiave in database ha la precedenza; l'ambiente e' il ripiego per lo sviluppo.
  let apiKey: string | null = null
  try {
    // Il campo cifrato esce mascherato dal suo afterRead, e la Local API esegue
    // gli hook di campo sempre, anche con overrideAccess o showHiddenFields:
    // il valore cifrato si legge solo dall'adattatore del database.
    const g = (await payload.db.findGlobal({
      slug: 'ai-settings',
      select: { anthropicApiKey: true },
    })) as Record<string, any> | null
    apiKey = tryDecryptSecret(g?.anthropicApiKey)
  } catch {
    apiKey = null
  }

  apiKey ??= process.env.ANTHROPIC_API_KEY ?? null

  if (!apiKey) {
    return {
      ok: false,
      motivo: 'non_configurato',
      messaggio:
        'Nessuna chiave API configurata. Un Amministratore può inserirla in Impostazioni AI.',
    }
  }

  return { ok: true, client: new Anthropic({ apiKey }), config }
}

/**
 * Parametri di ragionamento per Opus 5.5 e Sonnet 5.5.
 *
 * Su entrambi il ragionamento non si spegne (`disabled` e `budget_tokens`
 * rispondono 400): si regola solo con `effort`. Lo passiamo sempre in modo
 * esplicito perché su Opus 5.5 il valore predefinito è sceso a `medium`.
 */
export function parametriRagionamento(
  _model: string,
  effort: ConfigurazioneAi['effort'],
): { thinking: { type: 'adaptive' }; effort: ConfigurazioneAi['effort'] } {
  return { thinking: { type: 'adaptive' }, effort }
}

/**
 * Paracadute in caso di rifiuto. Se i filtri di sicurezza del modello
 * declinano una richiesta (succede anche su testi giornalistici legittimi:
 * cronaca nera, conflitti, sanità), la stessa richiesta viene rieseguita sul
 * modello di riserva che Anthropic sceglie per quella categoria, nella stessa
 * chiamata. Se rifiuta anche quello, `stop_reason` resta `refusal` e la
 * redazione vede il messaggio di sempre.
 */
export const PARACADUTE_RIFIUTO: {
  betas: Anthropic.Beta.AnthropicBeta[]
  fallbacks: 'default'
} = {
  betas: ['server-side-fallback-2026-07-01'],
  fallbacks: 'default',
}

/** Stima del costo di una chiamata, per il registro consumi — RF-AI-10. */
export function stimaCostoEur(
  config: ConfigurazioneAi,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const listino =
    config.pricing.find((p) => p.model === model) ??
    LISTINO_PREDEFINITO.find((p) => p.model === model)
  if (!listino) return 0

  const usd =
    (inputTokens / 1_000_000) * listino.inputPerMillion +
    (outputTokens / 1_000_000) * listino.outputPerMillion

  return Number((usd * config.usdToEur).toFixed(4))
}
