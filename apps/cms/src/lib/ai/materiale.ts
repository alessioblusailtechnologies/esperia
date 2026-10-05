import { parse, type HTMLElement } from 'node-html-parser'
import type { Payload } from 'payload'

/**
 * Il materiale da cui l'AI scrive una bozza da hot topic — RF-AI-04.
 *
 * Titolo e sintesi dell'argomento non bastano: con due righe il modello può
 * solo allungare il brodo, e ogni fatto che non conosce finisce fra i punti
 * da verificare. Per ogni notizia del gruppo raccogliamo quindi l'estratto
 * del feed (già salvato in `news-items`) e, quando la pagina lo consente, il
 * testo dell'articolo. Se la pagina non risponde, è dietro paywall o non ha
 * un corpo riconoscibile, resta l'estratto: la bozza si scrive comunque.
 */

export interface FonteMateriale {
  titolo: string
  url: string
  testata?: string
  data?: string
  estratto?: string
  /** Il corpo dell'articolo letto dalla pagina, se è stato possibile. */
  testo?: string
}

const FONTI_DA_LEGGERE = 6
const TIMEOUT_MS = 10_000
const PAGINA_MAX = 3 * 1024 * 1024
const TESTO_PER_FONTE = 6_000
const TESTO_TOTALE = 28_000
/** Sotto questa lunghezza il «corpo» trovato è quasi sempre menu o didascalie. */
const TESTO_MIN = 400

interface Riferimento {
  title?: string | null
  url?: string | null
  publisher?: string | null
  publishedAt?: string | null
}

export async function materialeHotTopic(
  payload: Payload,
  riferimenti: Riferimento[],
): Promise<FonteMateriale[]> {
  const fonti: FonteMateriale[] = riferimenti
    .filter((r) => r.url)
    .map((r) => ({
      titolo: String(r.title ?? ''),
      url: String(r.url),
      testata: r.publisher ? String(r.publisher) : undefined,
      data: r.publishedAt ? String(r.publishedAt) : undefined,
    }))

  // Gli estratti dei feed, già in casa.
  if (fonti.length) {
    const { docs } = await payload.find({
      collection: 'news-items',
      where: { url: { in: fonti.map((f) => f.url) } },
      pagination: false,
      depth: 0,
      overrideAccess: true,
    })
    const perUrl = new Map(docs.map((d) => [d.url, d.excerpt ?? '']))
    for (const f of fonti) {
      const estratto = perUrl.get(f.url)?.trim()
      if (estratto) f.estratto = estratto
    }
  }

  // Le pagine, in parallelo e con un tetto: le più recenti prima.
  const daLeggere = [...fonti]
    .sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''))
    .slice(0, FONTI_DA_LEGGERE)
  const testi = await Promise.all(daLeggere.map((f) => leggiArticolo(f.url).catch(() => null)))

  let totale = 0
  daLeggere.forEach((f, i) => {
    const testo = testi[i]
    if (!testo || totale >= TESTO_TOTALE) return
    f.testo = testo.slice(0, Math.min(TESTO_PER_FONTE, TESTO_TOTALE - totale))
    totale += f.testo.length
  })

  return fonti
}

/** Il materiale come blocchi leggibili dal modello, uno per fonte. */
export function materialeInTesto(fonti: FonteMateriale[]): string {
  return fonti
    .map((f, i) => {
      const testata = [f.testata, f.data ? f.data.slice(0, 10) : ''].filter(Boolean).join(', ')
      return [
        `[${i + 1}] ${f.titolo}${testata ? ` (${testata})` : ''}`,
        f.url,
        f.estratto ? `Estratto: ${f.estratto}` : '',
        f.testo
          ? `Testo dell’articolo (estratto automaticamente dalla pagina, può contenere residui di impaginazione):\n${f.testo}`
          : 'Testo dell’articolo non disponibile.',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n---\n\n')
}

/* -------------------------------------------------------------------------- */
/* Lettura della pagina                                                       */
/* -------------------------------------------------------------------------- */

async function leggiArticolo(url: string): Promise<string | null> {
  const indirizzo = new URL(url)
  if (indirizzo.protocol !== 'http:' && indirizzo.protocol !== 'https:') return null

  const risposta = await fetch(indirizzo, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
    headers: {
      'User-Agent': 'EsperiaBot/1.0 (monitoraggio fonti redazionali)',
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
      'Accept-Language': 'it-IT,it;q=0.9',
    },
  })
  if (!risposta.ok || !risposta.body) return null
  if (!(risposta.headers.get('content-type') ?? '').includes('html')) return null

  const lettore = risposta.body.getReader()
  const pezzi: Uint8Array[] = []
  let letti = 0
  for (;;) {
    const { done, value } = await lettore.read()
    if (done) break
    letti += value.byteLength
    if (letti > PAGINA_MAX) {
      await lettore.cancel()
      break
    }
    pezzi.push(value)
  }

  const testo = estraiCorpo(new TextDecoder('utf-8').decode(Buffer.concat(pezzi)))
  return testo && testo.length >= TESTO_MIN ? testo : null
}

const DA_TOGLIERE =
  'script, style, noscript, template, svg, iframe, form, nav, header, footer, aside, figure, figcaption, button, [role="navigation"], [aria-hidden="true"]'

/**
 * Il corpo dell'articolo senza dipendere dal sito: si preferisce il primo
 * `<article>` (o il contenitore dichiarato articleBody), altrimenti il
 * contenitore con più testo in paragrafi. Restano solo paragrafi, titoletti
 * e voci di elenco abbastanza lunghi da essere testo, non menu.
 */
export function estraiCorpo(html: string): string | null {
  const radice = parse(html, { comment: false })
  for (const n of radice.querySelectorAll(DA_TOGLIERE)) n.remove()

  const candidati = [
    ...radice.querySelectorAll('[itemprop="articleBody"]'),
    ...radice.querySelectorAll('article'),
  ]
  let contenitore: HTMLElement | null =
    candidati.find((c) => lunghezzaParagrafi(c) >= TESTO_MIN) ?? null

  if (!contenitore) {
    // Il genitore dei paragrafi che, insieme, fanno più testo.
    const punteggi = new Map<HTMLElement, number>()
    for (const p of radice.querySelectorAll('p')) {
      const genitore = p.parentNode as HTMLElement | null
      if (!genitore) continue
      punteggi.set(genitore, (punteggi.get(genitore) ?? 0) + testoPulito(p).length)
    }
    contenitore = [...punteggi.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }
  if (!contenitore) return null

  const righe: string[] = []
  for (const n of contenitore.querySelectorAll('p, h2, h3, li, blockquote')) {
    const t = testoPulito(n)
    if (t.length < 40 && !/^h[23]$/i.test(n.tagName)) continue
    if (righe[righe.length - 1] !== t) righe.push(t)
  }
  return righe.join('\n\n').trim() || null
}

function lunghezzaParagrafi(el: HTMLElement): number {
  return el.querySelectorAll('p').reduce((t, p) => t + testoPulito(p).length, 0)
}

function testoPulito(el: HTMLElement): string {
  return el.text.replace(/\s+/g, ' ').trim()
}
