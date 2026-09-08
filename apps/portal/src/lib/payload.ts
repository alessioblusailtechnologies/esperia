import type {
  Article,
  Category,
  Page,
  Paginated,
  Redirect,
  SiteSettings,
  Tag,
} from './types'
import { MOCK } from './modalita'

/**
 * Client di lettura verso il CMS.
 *
 * Il portale parla con Payload SOLO da server: nessuna chiave, nessun token e
 * nessuna URL interna raggiunge il browser. Le uniche chiamate che il browser
 * fa in autonomia vanno a Supabase (community), dove la protezione e' RLS.
 */

const BASE = (import.meta.env.PAYLOAD_URL ?? 'http://localhost:3001').replace(/\/$/, '')

/** Oltre questa soglia consideriamo il CMS non disponibile e degradiamo. RNF-10 */
const TIMEOUT_MS = 8000

export class CmsUnavailableError extends Error {
  constructor(cause: string) {
    super(`CMS non raggiungibile: ${cause}`)
    this.name = 'CmsUnavailableError'
  }
}

type QueryValue = string | number | boolean | undefined | null

function buildQuery(params: Record<string, QueryValue>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

async function get<T>(path: string, init?: RequestInit): Promise<T> {
  /*
   * Modalita' dimostrativa: la sorgente cambia, la logica no.
   *
   * L'intercettazione sta qui, sul trasporto, e non piu' in alto: filtri,
   * impaginazione, ordinamento, articoli correlati, cache di processo, RSS e
   * sitemap continuano a passare dal codice di produzione. Cosi' il portale
   * mostrato al Committente e' lo stesso che andra' online, con dati diversi.
   *
   * Import dinamico: i contenuti finti non entrano nel bundle reale.
   */
  if (MOCK) {
    const { rispondiMock } = await import('@/mock/api')
    return rispondiMock<T>(path)
  }

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { accept: 'application/json', ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    throw new CmsUnavailableError((err as Error).message)
  }

  if (!res.ok) {
    throw new CmsUnavailableError(`${res.status} ${res.statusText} su ${path}`)
  }

  return (await res.json()) as T
}

/* -------------------------------------------------------------------------- */
/* Cache di processo                                                          */
/*                                                                            */
/* Impostazioni e redirect servono su OGNI richiesta ma cambiano di rado:      */
/* senza cache ogni pagina farebbe due round trip in piu' verso il CMS.        */
/* La invalida /api/revalidate quando il CMS notifica un cambiamento.          */
/* -------------------------------------------------------------------------- */

const CACHE_TTL_MS = 60_000
const cache = new Map<string, { at: number; value: unknown }>()

async function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T

  try {
    const value = await loader()
    cache.set(key, { at: Date.now(), value })
    return value
  } catch (err) {
    // Meglio servire un valore vecchio che una pagina rotta: il menu e le
    // impostazioni cambiano di rado e un CMS momentaneamente giu' non deve
    // portarsi dietro il portale (RNF-10).
    if (hit) return hit.value as T
    throw err
  }
}

export function clearCmsCache(): void {
  cache.clear()
}

/* -------------------------------------------------------------------------- */
/* Articoli                                                                   */
/* -------------------------------------------------------------------------- */

export const ARTICLES_PER_PAGE = 12

interface ArticleQuery {
  page?: number
  limit?: number
  categorySlug?: string
  tagSlug?: string
  featured?: boolean
  excludeId?: string
}

export async function getArticles(opts: ArticleQuery = {}): Promise<Paginated<Article>> {
  const params: Record<string, QueryValue> = {
    depth: 1,
    limit: opts.limit ?? ARTICLES_PER_PAGE,
    page: opts.page ?? 1,
    sort: '-publishedAt',
  }

  // L'access control lato CMS filtra gia' su _status e publishedAt: qui
  // aggiungiamo solo i filtri di navigazione.
  if (opts.categorySlug) params['where[category.slug][equals]'] = opts.categorySlug
  if (opts.tagSlug) params['where[tags.slug][equals]'] = opts.tagSlug
  if (opts.featured) params['where[featured][equals]'] = true
  if (opts.excludeId) params['where[id][not_equals]'] = opts.excludeId

  return get<Paginated<Article>>(`/api/articles${buildQuery(params)}`)
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const res = await get<Paginated<Article>>(
    `/api/articles${buildQuery({
      depth: 2,
      limit: 1,
      'where[slug][equals]': slug,
    })}`,
  )
  return res.docs[0] ?? null
}

/**
 * Anteprima di una bozza — RF-B-04.
 * Richiede il token di servizio: senza, l'access control del CMS non
 * restituirebbe nulla che non sia gia' pubblicato.
 */
export async function getArticleDraft(slug: string): Promise<Article | null> {
  const token = import.meta.env.PORTAL_REVALIDATE_SECRET
  if (!token) return null

  const res = await get<Paginated<Article>>(
    `/api/articles${buildQuery({
      depth: 2,
      limit: 1,
      draft: true,
      'where[slug][equals]': slug,
    })}`,
    { headers: { 'x-preview-secret': token } },
  )
  return res.docs[0] ?? null
}

/**
 * Articoli correlati — RF-P-04.
 *
 * Prima la selezione manuale della redazione; se assente, ripiega su stessa
 * categoria e tag condivisi. Una scelta editoriale batte sempre un algoritmo.
 */
export async function getRelatedArticles(article: Article, limit = 3): Promise<Article[]> {
  const manual = (article.relatedArticles ?? []).filter(
    (a): a is Article => typeof a === 'object' && a !== null,
  )
  if (manual.length > 0) return manual.slice(0, limit)

  const categorySlug =
    typeof article.category === 'object' ? article.category.slug : undefined

  const tagSlugs = (article.tags ?? [])
    .filter((t): t is Tag => typeof t === 'object' && t !== null)
    .map((t) => t.slug)

  // Primo tentativo: stesso tag principale, che e' il segnale piu' specifico.
  if (tagSlugs[0]) {
    const byTag = await getArticles({
      tagSlug: tagSlugs[0],
      limit,
      excludeId: article.id,
    })
    if (byTag.docs.length >= limit) return byTag.docs
  }

  if (!categorySlug) return []
  const byCategory = await getArticles({ categorySlug, limit, excludeId: article.id })
  return byCategory.docs
}

/**
 * Ricerca full-text — RF-P-05.
 *
 * Usa l'endpoint dedicato del CMS, che interroga l'indice tsvector italiano di
 * Postgres con ranking per pertinenza e recency. Un `like` sui titoli via REST
 * non ordinerebbe per rilevanza e ignorerebbe il corpo dell'articolo.
 */
export async function searchArticles(
  query: string,
  page = 1,
): Promise<Paginated<Article>> {
  const trimmed = query.trim()
  if (trimmed.length < 2) {
    return {
      docs: [],
      totalDocs: 0,
      totalPages: 0,
      page: 1,
      limit: ARTICLES_PER_PAGE,
      hasNextPage: false,
      hasPrevPage: false,
      nextPage: null,
      prevPage: null,
    }
  }

  return get<Paginated<Article>>(
    `/api/ricerca${buildQuery({ q: trimmed, page, limit: ARTICLES_PER_PAGE })}`,
  )
}

/* -------------------------------------------------------------------------- */
/* Tassonomie e pagine                                                        */
/* -------------------------------------------------------------------------- */

export async function getCategories(): Promise<Category[]> {
  return cached('categories', async () => {
    const res = await get<Paginated<Category>>(
      `/api/categories${buildQuery({ limit: 100, sort: 'order' })}`,
    )
    return res.docs
  })
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const all = await getCategories()
  return all.find((c) => c.slug === slug) ?? null
}

export async function getTagBySlug(slug: string): Promise<Tag | null> {
  const res = await get<Paginated<Tag>>(
    `/api/tags${buildQuery({ limit: 1, 'where[slug][equals]': slug })}`,
  )
  return res.docs[0] ?? null
}

export async function getPageBySlug(slug: string): Promise<Page | null> {
  const res = await get<Paginated<Page>>(
    `/api/pages${buildQuery({ depth: 1, limit: 1, 'where[slug][equals]': slug })}`,
  )
  return res.docs[0] ?? null
}

export async function getFooterPages(): Promise<Page[]> {
  return cached('footer-pages', async () => {
    const res = await get<Paginated<Page>>(
      `/api/pages${buildQuery({
        limit: 20,
        sort: 'footerOrder',
        'where[showInFooter][equals]': true,
      })}`,
    )
    return res.docs
  })
}

/* -------------------------------------------------------------------------- */
/* Impostazioni e redirect                                                    */
/* -------------------------------------------------------------------------- */

export async function getSiteSettings(): Promise<SiteSettings> {
  return cached('site-settings', () =>
    get<SiteSettings>(`/api/globals/site-settings${buildQuery({ depth: 1 })}`),
  )
}

export async function getRedirects(): Promise<Redirect[]> {
  return cached('redirects', async () => {
    const res = await get<Paginated<Redirect>>(
      `/api/redirects${buildQuery({ limit: 500, 'where[active][equals]': true })}`,
    )
    return res.docs
  })
}

/** Tutte le URL indicizzabili, per la sitemap — RF-P-07. */
export async function getAllPublishedSlugs(): Promise<{
  articles: Array<{ slug: string; updatedAt: string; publishedAt: string | null }>
  categories: Array<{ slug: string }>
  pages: Array<{ slug: string; updatedAt: string }>
}> {
  const [articles, categories, pages] = await Promise.all([
    get<Paginated<Article>>(
      `/api/articles${buildQuery({ depth: 0, limit: 5000, sort: '-publishedAt' })}`,
    ),
    getCategories(),
    get<Paginated<Page>>(`/api/pages${buildQuery({ depth: 0, limit: 200 })}`),
  ])

  return {
    articles: articles.docs.map((a) => ({
      slug: a.slug,
      updatedAt: a.updatedAt,
      publishedAt: a.publishedAt ?? null,
    })),
    categories: categories.map((c) => ({ slug: c.slug })),
    pages: pages.docs.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt })),
  }
}
