/**
 * Forma dei dati che il portale consuma dall'API del CMS.
 *
 * Sono dichiarati qui, e non importati dai tipi generati di Payload, di
 * proposito: in un'architettura headless il confine fra i due sistemi e' un
 * contratto HTTP. Scriverlo esplicitamente rende visibile in code review
 * qualunque campo il portale stia davvero usando, e fa fallire il typecheck
 * quando il CMS cambia forma invece di far apparire `undefined` in pagina.
 */

export interface MediaSize {
  url: string | null
  width: number | null
  height: number | null
}

export interface Media {
  id: string
  url: string
  alt: string
  caption?: string | null
  credit?: string | null
  width?: number | null
  height?: number | null
  mimeType?: string | null
  sizes?: Partial<Record<'thumbnail' | 'card' | 'hero' | 'og', MediaSize>>
}

export interface Category {
  id: string
  name: string
  slug: string
  description?: string | null
  color?: string | null
  order?: number | null
  showInMenu?: boolean | null
  seo?: Seo | null
}

export interface Tag {
  id: string
  name: string
  slug: string
  description?: string | null
}

export interface Author {
  id: string
  name: string
  bio?: string | null
  avatar?: Media | string | null
}

export interface Seo {
  metaTitle?: string | null
  metaDescription?: string | null
  ogImage?: Media | string | null
  canonicalUrl?: string | null
  noIndex?: boolean | null
}

/** Documento Lexical serializzato. Il rendering vive in components/RichText.astro. */
export interface RichTextDocument {
  root: {
    type: string
    children: unknown[]
    [key: string]: unknown
  }
}

export interface Article {
  id: string
  slug: string
  title: string
  kicker?: string | null
  subtitle?: string | null
  excerpt?: string | null
  content: RichTextDocument
  heroImage?: Media | string | null
  category: Category | string
  tags?: (Tag | string)[] | null
  authors?: (Author | string)[] | null
  publishedAt?: string | null
  updatedAt: string
  createdAt: string
  featured?: boolean | null
  readingMinutes?: number | null
  relatedArticles?: (Article | string)[] | null
  seo?: Seo | null
  ai?: {
    origin?: string | null
    humanReviewed?: boolean | null
  } | null
  _status?: 'draft' | 'published'
  /**
   * Frammento con i termini cercati evidenziati, presente solo nelle risposte
   * dell'endpoint di ricerca. HTML gia' sanificato dal CMS: contiene solo
   * <mark>, tutto il resto e' escapato (RNF-03).
   */
  evidenza?: string | null
}

export interface Page {
  id: string
  slug: string
  title: string
  content: RichTextDocument
  showInFooter?: boolean | null
  footerOrder?: number | null
  seo?: Seo | null
  updatedAt: string
}

export interface Redirect {
  id: string
  from: string
  to: string
  type: '301' | '302'
  active: boolean
}

export interface SiteSettings {
  siteName: string
  tagline?: string | null
  logo?: Media | string | null
  defaultOgImage?: Media | string | null
  publisherName?: string | null
  /** Dicitura di registrazione al tribunale, mostrata nel piede. */
  legalNotice?: string | null
  /** Partita IVA e sede legale. */
  companyDetails?: string | null
  editorInChief?: string | null
  featuredArticles?: (Article | string)[] | null
  homeSections?: Array<{
    category: Category | string
    title?: string | null
    limit?: number | null
  }> | null
  social?: Array<{ platform: string; url: string }> | null
  twitterHandle?: string | null
  contactEmail?: string | null
  cookieBanner?: {
    enabled?: boolean | null
    message?: string | null
    privacyPage?: Page | string | null
    cookiePage?: Page | string | null
  } | null
  analytics?: {
    provider?: 'nessuno' | 'plausible' | 'umami' | 'ga4' | null
    siteId?: string | null
    scriptUrl?: string | null
  } | null
  maintenanceMode?: boolean | null
  maintenanceMessage?: string | null
}

/** Involucro standard delle collection paginate di Payload. */
export interface Paginated<T> {
  docs: T[]
  totalDocs: number
  totalPages: number
  page: number
  limit: number
  hasNextPage: boolean
  hasPrevPage: boolean
  nextPage: number | null
  prevPage: number | null
}

/* -------------------------------------------------------------------------- */
/* Helper per i campi che Payload restituisce come id oppure come oggetto,     */
/* a seconda del parametro `depth`.                                            */
/* -------------------------------------------------------------------------- */

export function isPopulated<T extends object>(value: T | string | null | undefined): value is T {
  return typeof value === 'object' && value !== null
}

export function populated<T extends object>(value: T | string | null | undefined): T | null {
  return isPopulated(value) ? value : null
}

export function populatedList<T extends object>(
  values: (T | string)[] | null | undefined,
): T[] {
  if (!Array.isArray(values)) return []
  return values.filter(isPopulated)
}
