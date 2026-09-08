import rss from '@astrojs/rss'
import type { APIRoute } from 'astro'
import { getArticles, getCategoryBySlug, getSiteSettings } from '@/lib/payload'
import { absoluteUrl } from '@/lib/seo'
import { populated } from '@/lib/types'
import type { Category } from '@/lib/types'

/**
 * Feed RSS generale e per categoria — RF-P-11.
 * /rss.xml            tutte le notizie
 * /rss.xml?categoria=cronaca   solo una sezione
 */
export const GET: APIRoute = async ({ url }) => {
  const settings = await getSiteSettings()
  const slugCategoria = url.searchParams.get('categoria')

  const categoria = slugCategoria ? await getCategoryBySlug(slugCategoria) : null
  if (slugCategoria && !categoria) {
    return new Response('Categoria non trovata', { status: 404 })
  }

  const articoli = await getArticles({
    limit: 50,
    categorySlug: categoria?.slug,
  })

  const titolo = categoria
    ? `${settings.siteName} — ${categoria.name}`
    : `${settings.siteName}${settings.tagline ? ` — ${settings.tagline}` : ''}`

  return rss({
    title: titolo,
    description: settings.tagline ?? `Le notizie di ${settings.siteName}`,
    site: absoluteUrl('/'),
    xmlns: { dc: 'http://purl.org/dc/elements/1.1/' },
    customData: '<language>it-IT</language>',
    items: articoli.docs.map((a) => {
      const cat = populated<Category>(a.category)
      return {
        title: a.title,
        description: a.excerpt ?? '',
        link: absoluteUrl(`/${a.slug}`),
        pubDate: a.publishedAt ? new Date(a.publishedAt) : new Date(a.createdAt),
        categories: cat ? [cat.name] : [],
      }
    }),
  })
}
