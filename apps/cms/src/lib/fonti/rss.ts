import Parser from 'rss-parser'
import type { Adattatore, NotiziaNormalizzata } from './tipi'

/**
 * Adattatore per feed RSS 2.0 e Atom — RF-AI-01.
 *
 * Il download lo facciamo noi e non `parser.parseURL()`: ci servono un tetto
 * alla dimensione (un feed malformato o ostile non deve saturare la memoria del
 * CMS), un timeout vero e un User-Agent riconoscibile, che alcune testate
 * richiedono per non rispondere 403.
 */

const TIMEOUT_MS = 15_000
const DIMENSIONE_MASSIMA = 5 * 1024 * 1024
const NOTIZIE_PER_FEED = 100
const ESTRATTO_MAX = 600

type CampoSorgente = string | { _?: string } | undefined

const parser = new Parser<Record<string, unknown>, { source?: CampoSorgente }>({
  // `<source>` e' l'elemento con cui gli aggregatori (Google News, per esempio)
  // dichiarano la testata originale di ogni notizia.
  customFields: { item: ['source'] },
})

async function scarica(url: string): Promise<string> {
  const indirizzo = new URL(url)
  if (indirizzo.protocol !== 'http:' && indirizzo.protocol !== 'https:') {
    throw new Error(`Protocollo non ammesso: ${indirizzo.protocol}`)
  }

  let risposta: Response
  try {
    risposta = await fetch(indirizzo, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
      headers: {
        'User-Agent': 'EsperiaBot/1.0 (monitoraggio fonti redazionali)',
        Accept:
          'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5',
      },
    })
  } catch (err) {
    // `fetch` dice solo "fetch failed": il motivo utile all'amministratore sta nella causa.
    throw new Error(descriviErroreRete(err))
  }

  if (!risposta.ok) throw new Error(`HTTP ${risposta.status} ${risposta.statusText}`.trim())
  if (!risposta.body) throw new Error('Risposta vuota')

  const lettore = risposta.body.getReader()
  const pezzi: Uint8Array[] = []
  let letti = 0

  for (;;) {
    const { done, value } = await lettore.read()
    if (done) break
    letti += value.byteLength
    if (letti > DIMENSIONE_MASSIMA) {
      await lettore.cancel()
      throw new Error(`Feed oltre ${DIMENSIONE_MASSIMA / 1024 / 1024} MB: interrotto`)
    }
    pezzi.push(value)
  }

  return new TextDecoder('utf-8').decode(Buffer.concat(pezzi))
}

function descriviErroreRete(err: unknown): string {
  const e = err as { name?: string; message?: string; cause?: { code?: string; message?: string } }
  if (e.name === 'TimeoutError') return `Nessuna risposta entro ${TIMEOUT_MS / 1000} secondi`
  switch (e.cause?.code) {
    case 'ENOTFOUND':
      return 'Indirizzo inesistente: il dominio non risulta registrato'
    case 'ECONNREFUSED':
      return 'Il server ha rifiutato la connessione'
    case 'ECONNRESET':
      return 'Connessione interrotta dal server'
    case 'CERT_HAS_EXPIRED':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
      return `Certificato HTTPS non valido (${e.cause.code})`
  }
  return e.cause?.message ?? e.message ?? 'Errore di rete'
}

function testoSorgente(s: CampoSorgente): string {
  if (!s) return ''
  return (typeof s === 'string' ? s : (s._ ?? '')).trim()
}

function pulisci(testo: string | undefined): string {
  return (testo ?? '').replace(/\s+/g, ' ').trim()
}

export const leggiRss: Adattatore = async (fonte) => {
  const xml = await scarica(fonte.endpoint)
  const feed = await parser.parseString(xml)
  const testataFeed = pulisci(feed.title) || fonte.name
  const adesso = new Date()

  const notizie: NotiziaNormalizzata[] = []

  for (const item of feed.items.slice(0, NOTIZIE_PER_FEED)) {
    let titolo = pulisci(item.title)
    const url = pulisci(item.link) || pulisci(item.guid)
    if (!titolo || !/^https?:\/\//i.test(url)) continue

    const testata = testoSorgente(item.source) || testataFeed

    // Gli aggregatori accodano la testata al titolo ("Titolo - Testata"):
    // lasciarla farebbe somigliare fra loro tutte le notizie della stessa testata.
    const coda = ` - ${testata}`
    if (titolo.endsWith(coda)) titolo = titolo.slice(0, -coda.length).trim()

    const data = new Date(item.isoDate ?? item.pubDate ?? '')
    const dataValida = Number.isNaN(data.getTime()) || data > adesso ? adesso : data

    const estratto = pulisci(item.contentSnippet ?? item.summary)

    notizie.push({
      titolo,
      url,
      testata,
      dataPubblicazione: dataValida.toISOString(),
      estratto: estratto ? estratto.slice(0, ESTRATTO_MAX) : undefined,
    })
  }

  return notizie
}
