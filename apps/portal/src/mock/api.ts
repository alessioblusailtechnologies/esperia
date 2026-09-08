import type { Article, Paginated } from '@/lib/types'
import { articoli, articoliRecenti, categorie, impostazioni, pagine, tag, testoPiano } from './dati'

/**
 * Finta API REST di Payload per la modalita' dimostrativa.
 *
 * Risponde ai percorsi che `lib/payload.ts` costruisce, con la stessa forma
 * dell'originale. E' l'UNICO punto in cui la modalita' mock si sostituisce al
 * CMS: tutto il resto del portale — filtri, impaginazione, articoli correlati,
 * RSS, sitemap, SEO — continua a passare dal codice di produzione.
 *
 * Sostituisce il trasporto, non la logica. Un mock che reimplementasse le
 * query mostrerebbe al Committente un portale diverso da quello che poi va
 * in produzione.
 */

export class PercorsoMockSconosciuto extends Error {
  constructor(percorso: string) {
    super(`Percorso non previsto dalla modalita' dimostrativa: ${percorso}`)
    this.name = 'PercorsoMockSconosciuto'
  }
}

function impagina<T>(elementi: T[], page: number, limit: number): Paginated<T> {
  const totalDocs = elementi.length
  const totalPages = Math.max(1, Math.ceil(totalDocs / limit))
  const paginaCorrente = Math.min(Math.max(1, page), totalPages)
  const inizio = (paginaCorrente - 1) * limit

  return {
    docs: elementi.slice(inizio, inizio + limit),
    totalDocs,
    totalPages,
    page: paginaCorrente,
    limit,
    hasNextPage: paginaCorrente < totalPages,
    hasPrevPage: paginaCorrente > 1,
    nextPage: paginaCorrente < totalPages ? paginaCorrente + 1 : null,
    prevPage: paginaCorrente > 1 ? paginaCorrente - 1 : null,
  }
}

/* -------------------------------------------------------------------------- */
/* Ricerca                                                                    */
/* -------------------------------------------------------------------------- */

const ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as const

function escapeHtml(testo: string): string {
  return testo.replace(/[&<>"']/g, (c) => ESCAPE[c as keyof typeof ESCAPE])
}

function senzaAccenti(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/**
 * Frammento con i termini evidenziati.
 *
 * L'endpoint vero costruisce l'evidenza con ts_headline e la sanifica lato
 * CMS; qui il testo e' nostro, ma lo escapiamo lo stesso e reintroduciamo solo
 * <mark>: il portale si fida di questo campo e lo stampa con set:html, quindi
 * la regola vale anche per la dimostrazione (RNF-03).
 */
function evidenzia(testo: string, termini: string[]): string {
  const piano = senzaAccenti(testo)
  const primo = termini
    .map((t) => piano.indexOf(senzaAccenti(t)))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0]

  const inizio = primo === undefined ? 0 : Math.max(0, primo - 70)
  const grezzo = testo.slice(inizio, inizio + 230)
  const frammento = (inizio > 0 ? '…' : '') + grezzo + (inizio + 230 < testo.length ? '…' : '')

  const pattern = termini
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  if (!pattern) return escapeHtml(frammento)

  return frammento
    .split(new RegExp(`(${pattern})`, 'gi'))
    .map((pezzo, i) => (i % 2 === 1 ? `<mark>${escapeHtml(pezzo)}</mark>` : escapeHtml(pezzo)))
    .join('')
}

function cerca(query: string, page: number, limit: number): Paginated<Article> {
  const termini = query.split(/\s+/).filter((t) => t.length >= 2)
  if (termini.length === 0) return impagina<Article>([], 1, limit)

  const punteggiati = articoliRecenti
    .map((a) => {
      const corpo = testoPiano(a)
      const titolo = senzaAccenti(a.title)
      const sommario = senzaAccenti(a.excerpt ?? '')
      const testo = senzaAccenti(corpo)

      // Pesi come nell'indice del CMS: titolo A, sommario B, corpo C.
      let punteggio = 0
      for (const t of termini) {
        const n = senzaAccenti(t)
        if (titolo.includes(n)) punteggio += 10
        if (sommario.includes(n)) punteggio += 4
        if (testo.includes(n)) punteggio += 1
      }

      return { articolo: a, punteggio, corpo }
    })
    .filter((r) => r.punteggio > 0)
    .sort(
      (x, y) =>
        y.punteggio - x.punteggio ||
        Date.parse(y.articolo.publishedAt ?? '') - Date.parse(x.articolo.publishedAt ?? ''),
    )
    .map((r) => ({
      ...r.articolo,
      evidenza: evidenzia(`${r.articolo.excerpt} ${r.corpo}`, termini),
    }))

  return impagina(punteggiati, page, limit)
}

/* -------------------------------------------------------------------------- */
/* Instradamento                                                              */
/* -------------------------------------------------------------------------- */

export function rispondiMock<T>(percorso: string): T {
  const url = new URL(percorso, 'http://dimostrazione.local')
  const p = url.searchParams
  const numero = (chiave: string, difetto: number) => Number(p.get(chiave) ?? difetto) || difetto
  const limit = numero('limit', 12)
  const page = numero('page', 1)

  switch (url.pathname) {
    case '/api/articles': {
      // Un'anteprima di bozza non ha senso senza CMS: nessun documento.
      if (p.get('draft') === 'true') return impagina<Article>([], 1, limit) as T

      let elenco = articoliRecenti

      const slug = p.get('where[slug][equals]')
      if (slug) elenco = elenco.filter((a) => a.slug === slug)

      const categoria = p.get('where[category.slug][equals]')
      if (categoria) {
        elenco = elenco.filter(
          (a) => typeof a.category === 'object' && a.category.slug === categoria,
        )
      }

      const etichetta = p.get('where[tags.slug][equals]')
      if (etichetta) {
        elenco = elenco.filter((a) =>
          (a.tags ?? []).some((t) => typeof t === 'object' && t !== null && t.slug === etichetta),
        )
      }

      if (p.get('where[featured][equals]') === 'true') {
        elenco = elenco.filter((a) => a.featured)
      }

      const escluso = p.get('where[id][not_equals]')
      if (escluso) elenco = elenco.filter((a) => a.id !== escluso)

      return impagina(elenco, page, limit) as T
    }

    case '/api/ricerca':
      return cerca((p.get('q') ?? '').trim(), page, limit) as T

    case '/api/categories':
      return impagina(
        [...categorie].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
        1,
        Math.max(limit, categorie.length),
      ) as T

    case '/api/tags': {
      const slug = p.get('where[slug][equals]')
      const elenco = slug ? tag.filter((t) => t.slug === slug) : tag
      return impagina(elenco, page, Math.max(limit, elenco.length || 1)) as T
    }

    case '/api/pages': {
      let elenco = pagine
      const slug = p.get('where[slug][equals]')
      if (slug) elenco = elenco.filter((x) => x.slug === slug)
      if (p.get('where[showInFooter][equals]') === 'true') {
        elenco = elenco.filter((x) => x.showInFooter)
      }
      const ordinato = [...elenco].sort((a, b) => (a.footerOrder ?? 0) - (b.footerOrder ?? 0))
      return impagina(ordinato, page, Math.max(limit, ordinato.length || 1)) as T
    }

    case '/api/globals/site-settings':
      return impostazioni as T

    // Nessun redirect configurato: la collection esiste ma e' vuota, ed e'
    // esattamente cio' che il portale trova su un'installazione nuova.
    case '/api/redirects':
      return impagina([], 1, limit) as T

    default:
      throw new PercorsoMockSconosciuto(url.pathname)
  }
}

/** Corpus completo per l'indice di ricerca statico. */
export function corpusRicerca() {
  return articoliRecenti.map((a) => ({
    slug: a.slug,
    title: a.title,
    excerpt: a.excerpt ?? '',
    testo: testoPiano(a),
    categoria: typeof a.category === 'object' ? a.category.name : '',
    categoriaSlug: typeof a.category === 'object' ? a.category.slug : '',
    publishedAt: a.publishedAt,
    immagine:
      typeof a.heroImage === 'object' && a.heroImage
        ? (a.heroImage.sizes?.thumbnail?.url ?? a.heroImage.url)
        : null,
  }))
}

export { articoli, articoliRecenti, categorie, pagine, tag }
