import type { Article, Category, Media, Page, SiteSettings } from './types'
import { populated, populatedList } from './types'

/**
 * SEO tecnica — RF-P-06, RF-P-07.
 *
 * Tutto quello che finisce nel <head> passa da qui, cosi' che non esista una
 * pagina che dimentica il canonical o l'Open Graph. Il collaudo verifica
 * proprio questi elementi (capitolato §7).
 */

export const SITE_URL = (import.meta.env.PUBLIC_SITE_URL ?? 'http://localhost:4321').replace(
  /\/$/,
  '',
)

export function absoluteUrl(path: string): string {
  if (path.startsWith('http')) return path
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

/** URL assoluta di un media, con la variante richiesta se disponibile. */
export function mediaUrl(
  media: Media | string | null | undefined,
  size?: 'thumbnail' | 'card' | 'hero' | 'og',
): string | null {
  const m = populated<Media>(media)
  if (!m) return null

  const variant = size ? m.sizes?.[size]?.url : null
  const url = variant ?? m.url
  if (!url) return null

  return url.startsWith('http') ? url : absoluteUrl(url)
}

export interface MetaInput {
  title: string
  description?: string | null
  canonical?: string | null
  image?: string | null
  imageAlt?: string | null
  noIndex?: boolean
  type?: 'website' | 'article'
  publishedTime?: string | null
  modifiedTime?: string | null
  authors?: string[]
  section?: string | null
  tags?: string[]
}

/** Titolo effettivo della pagina: quello SEO se c'e', altrimenti il titolo editoriale. */
export function resolveTitle(
  ownTitle: string,
  seoTitle: string | null | undefined,
  siteName: string,
): string {
  const base = seoTitle?.trim() || ownTitle
  // Evita "Esperia — Esperia" sulla home.
  return base === siteName ? base : `${base} — ${siteName}`
}

export function truncate(text: string | null | undefined, max: number): string | undefined {
  if (!text) return undefined
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1).replace(/[\s,;:.]+\S*$/, '')}…`
}

/* -------------------------------------------------------------------------- */
/* Dati strutturati schema.org — RF-P-07                                      */
/* -------------------------------------------------------------------------- */

function publisher(settings: SiteSettings) {
  const logo = mediaUrl(settings.logo)
  return {
    '@type': 'Organization',
    name: settings.publisherName || settings.siteName,
    url: SITE_URL,
    ...(logo ? { logo: { '@type': 'ImageObject', url: logo } } : {}),
  }
}

/**
 * NewsArticle e' piu' specifico di Article e abilita funzioni di Google News.
 * Va usato solo su contenuti effettivamente giornalistici: per le pagine di
 * servizio restiamo su WebPage.
 */
export function articleJsonLd(article: Article, settings: SiteSettings): string {
  const category = populated<Category>(article.category)
  const image = mediaUrl(article.seo?.ogImage, 'og') ?? mediaUrl(article.heroImage, 'hero')
  const authors = populatedList<{ id: string; name: string }>(article.authors)

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: truncate(article.title, 110),
    ...(article.subtitle ? { alternativeHeadline: article.subtitle } : {}),
    description: truncate(article.excerpt ?? article.seo?.metaDescription, 300),
    ...(image ? { image: [image] } : {}),
    datePublished: article.publishedAt ?? article.createdAt,
    dateModified: article.updatedAt,
    ...(authors.length
      ? { author: authors.map((a) => ({ '@type': 'Person', name: a.name })) }
      : {}),
    publisher: publisher(settings),
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': absoluteUrl(`/${article.slug}`),
    },
    ...(category ? { articleSection: category.name } : {}),
    inLanguage: 'it-IT',
    isAccessibleForFree: true,
  })
}

export function pageJsonLd(page: Page, settings: SiteSettings): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: page.title,
    url: absoluteUrl(`/pagina/${page.slug}`),
    dateModified: page.updatedAt,
    publisher: publisher(settings),
    inLanguage: 'it-IT',
  })
}

export function websiteJsonLd(settings: SiteSettings): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: settings.siteName,
    url: SITE_URL,
    inLanguage: 'it-IT',
    publisher: publisher(settings),
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/ricerca?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  })
}

/** Le breadcrumb compaiono nei risultati di ricerca al posto dell'URL grezzo. */
export function breadcrumbJsonLd(
  trail: Array<{ name: string; url: string }>,
): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.url),
    })),
  })
}
