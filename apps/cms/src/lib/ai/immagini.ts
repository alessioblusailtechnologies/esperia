import type { Payload } from 'payload'
import { leggiConfigurazione } from './client'
import { tryDecryptSecret } from '@/lib/crypto'

/**
 * Immagini assistite con Google Gemini — RF-AI-07, RF-AI-08.
 *
 * Il redattore descrive l'immagine, Gemini genera le proposte, il redattore ne
 * sceglie una come copertina. Le proposte non vengono salvate da nessuna parte
 * finche' non c'e' una scelta: vivono solo nel pannello. L'immagine scelta
 * entra nella media library marcata come generata, con la dicitura nei crediti
 * (vedi l'hook in collections/Media.ts), e l'articolo resta in bozza.
 *
 * Endpoint: Interactions API di Gemini (generativelanguage.googleapis.com,
 * v1beta). Un'immagine per richiesta: le proposte multiple sono richieste
 * parallele, ognuna fatturata. Tutte le immagini di Gemini portano il
 * watermark invisibile SynthID.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions'
const TIMEOUT_MS = 90_000
export const DESCRIZIONE_MAX = 1000

export interface ImmagineProposta {
  base64: string
  mimeType: string
}

export interface ConfigurazioneImmagini {
  attivo: boolean
  messaggio: string
  model: string
  quante: number
  formato: string
  prezzoUsd: number
  usdToEur: number
  disclaimer: string
}

export type EsitoImmagini =
  { ok: true; immagini: ImmagineProposta[]; scartate: number } | { ok: false; messaggio: string }

export async function leggiConfigurazioneImmagini(
  payload: Payload,
): Promise<ConfigurazioneImmagini> {
  const ai = await leggiConfigurazione(payload)
  const g = (await payload
    .findGlobal({ slug: 'ai-settings', overrideAccess: true, depth: 0 })
    .catch(() => ({}))) as Record<string, any>

  const model = g.imageModel ?? 'gemini-3.1-flash-image'
  const listino = Array.isArray(g.imagePricing) ? g.imagePricing : []

  const attivo = ai.enabled && Boolean(g.imagesEnabled) && g.imageProvider === 'gemini'
  return {
    attivo,
    messaggio: !ai.enabled
      ? ai.disabledMessage
      : 'La generazione di immagini non è attiva. Un Amministratore può abilitarla in Impostazioni AI → Immagini, scegliendo Gemini come provider.',
    model,
    quante: Math.min(4, Math.max(1, Number(g.imageCount ?? 4))),
    formato: g.imageAspectRatio ?? '16:9',
    prezzoUsd: Number(listino.find((p: any) => p.model === model)?.perImage ?? 0),
    usdToEur: ai.usdToEur,
    disclaimer: g.imageDisclaimer || 'Immagine generata con intelligenza artificiale',
  }
}

async function chiaveGemini(payload: Payload): Promise<string | null> {
  // Come per Anthropic: il valore cifrato si legge dall'adattatore, perche' la
  // Local API restituisce la maschera del campo (vedi lib/ai/client.ts).
  const g = (await payload.db
    .findGlobal({ slug: 'ai-settings', select: { imageApiKey: true } })
    .catch(() => null)) as Record<string, any> | null
  return tryDecryptSecret(g?.imageApiKey) ?? process.env.GEMINI_API_KEY ?? null
}

/**
 * La descrizione del redattore, dentro una cornice fissa. I vincoli non sono
 * stile: un'immagine realistica di una persona vera, su una testata, e' una
 * notizia falsa; scritte e marchi inventati lo sono quasi altrettanto.
 */
function prompt(descrizione: string): string {
  return [
    'Immagine di copertina per un articolo di una testata giornalistica italiana.',
    `Soggetto e taglio: ${descrizione}`,
    'Vincoli: nessuna persona reale riconoscibile; nessuna scritta, cartello leggibile,',
    'logo o marchio; nessuna cornice o watermark visibile. Resa sobria, adatta a un',
    'contesto informativo.',
  ].join('\n')
}

/** Cerca nella risposta il primo contenuto immagine, ovunque si trovi. */
function estraiImmagine(nodo: unknown): ImmagineProposta | null {
  if (!nodo || typeof nodo !== 'object') return null
  const o = nodo as Record<string, unknown>
  const mime = (o.mime_type ?? o.mimeType) as unknown
  if (typeof o.data === 'string' && typeof mime === 'string' && mime.startsWith('image/')) {
    return { base64: o.data, mimeType: mime }
  }
  for (const v of Object.values(o)) {
    const trovata = Array.isArray(v)
      ? v.map(estraiImmagine).find(Boolean)
      : typeof v === 'object'
        ? estraiImmagine(v)
        : null
    if (trovata) return trovata
  }
  return null
}

class ErroreGemini extends Error {
  constructor(
    messaggio: string,
    readonly stato?: number,
  ) {
    super(messaggio)
  }
}

async function generaUna(
  chiave: string,
  conf: ConfigurazioneImmagini,
  descrizione: string,
): Promise<ImmagineProposta> {
  const risposta = await fetch(ENDPOINT, {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'x-goog-api-key': chiave, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: conf.model,
      input: [{ type: 'text', text: prompt(descrizione) }],
      response_format: {
        type: 'image',
        mime_type: 'image/jpeg',
        aspect_ratio: conf.formato,
        image_size: '1K',
      },
      // Le richieste non devono restare sui server di Google oltre il necessario.
      store: false,
    }),
  })

  const corpo = (await risposta.json().catch(() => null)) as Record<string, any> | null
  if (!risposta.ok) {
    const dettaglio = corpo?.error?.message ?? risposta.statusText
    throw new ErroreGemini(`HTTP ${risposta.status}: ${dettaglio}`, risposta.status)
  }
  if (corpo?.status && corpo.status !== 'completed') {
    const motivo = corpo.errors?.[0]?.message ?? corpo.status
    // Risposta 200 ma generazione fallita: in pratica un blocco sui contenuti,
    // che per il redattore equivale a un 400 (riformulare la descrizione).
    throw new ErroreGemini(`Generazione non completata: ${motivo}`, 400)
  }

  const immagine = estraiImmagine(corpo?.outputs ?? corpo)
  if (!immagine) throw new ErroreGemini('La risposta non contiene un’immagine.')
  return immagine
}

export async function generaImmagini(
  payload: Payload,
  utenteId: string,
  descrizione: string,
): Promise<EsitoImmagini> {
  const conf = await leggiConfigurazioneImmagini(payload)
  if (!conf.attivo) return { ok: false, messaggio: conf.messaggio }

  const chiave = await chiaveGemini(payload)
  if (!chiave) {
    return {
      ok: false,
      messaggio:
        'Nessuna chiave Gemini configurata. Un Amministratore può inserirla in Impostazioni AI → Immagini.',
    }
  }

  const avvio = Date.now()
  const esiti = await Promise.allSettled(
    Array.from({ length: conf.quante }, () => generaUna(chiave, conf, descrizione)),
  )
  const immagini = esiti.flatMap((e) => (e.status === 'fulfilled' ? [e.value] : []))
  const errori = esiti.flatMap((e) => (e.status === 'rejected' ? [e.reason as ErroreGemini] : []))

  // Registro consumi (RF-AI-10): si pagano solo le immagini prodotte.
  try {
    await payload.create({
      collection: 'ai-usage',
      overrideAccess: true,
      data: {
        provider: 'google',
        model: conf.model,
        operation: 'image_generation',
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostEur: Number((immagini.length * conf.prezzoUsd * conf.usdToEur).toFixed(4)),
        durationMs: Date.now() - avvio,
        success: immagini.length > 0,
        errorMessage: errori[0]?.message?.slice(0, 500),
        user: utenteId,
      },
    })
  } catch (err) {
    payload.logger.error(`Registrazione consumo immagini fallita: ${(err as Error).message}`)
  }

  if (immagini.length > 0) return { ok: true, immagini, scartate: errori.length }

  const primo = errori[0]
  payload.logger.error(`Generazione immagini fallita: ${primo?.message}`)
  if (primo?.stato === 401 || primo?.stato === 403) {
    return {
      ok: false,
      messaggio: 'La chiave Gemini non è valida o non è abilitata. Verificarla in Impostazioni AI.',
    }
  }
  if (primo?.stato === 429) {
    return {
      ok: false,
      messaggio: 'Limite di richieste Gemini raggiunto. Riprova fra qualche minuto.',
    }
  }
  if (primo?.stato === 400) {
    return {
      ok: false,
      messaggio:
        'Gemini non ha generato immagini per questa descrizione. Riformulala, evitando persone reali e marchi.',
    }
  }
  return {
    ok: false,
    messaggio: 'Il servizio di generazione immagini non è raggiungibile. Riprova più tardi.',
  }
}
