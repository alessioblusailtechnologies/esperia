import type { APIRoute } from 'astro'
import { getAllPublishedSlugs } from '@/lib/payload'
import { absoluteUrl } from '@/lib/seo'

/**
 * Sitemap XML — RF-P-07.
 *
 * Scritta a mano invece di usare @astrojs/sitemap perche' quel pacchetto
 * enumera le rotte a build time: con contenuti dinamici da CMS in modalita'
 * server produrrebbe una sitemap vuota. Qui interroghiamo il CMS a ogni
 * richiesta e la risposta viene messa in cache dalla CDN per un'ora.
 */

function url(loc: string, lastmod?: string, priority?: string, changefreq?: string): string {
  return [
    '  <url>',
    `    <loc>${absoluteUrl(loc)}</loc>`,
    lastmod ? `    <lastmod>${new Date(lastmod).toISOString()}</lastmod>` : '',
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : '',
    priority ? `    <priority>${priority}</priority>` : '',
    '  </url>',
  ]
    .filter(Boolean)
    .join('\n')
}

export const GET: APIRoute = async () => {
  const { articles, categories, pages } = await getAllPublishedSlugs()

  const voci = [
    url('/', undefined, '1.0', 'hourly'),
    ...categories.map((c) => url(`/categoria/${c.slug}`, undefined, '0.8', 'daily')),
    ...articles.map((a) => url(`/${a.slug}`, a.updatedAt, '0.7', 'weekly')),
    ...pages.map((p) => url(`/pagina/${p.slug}`, p.updatedAt, '0.4', 'monthly')),
  ]

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...voci,
    '</urlset>',
  ].join('\n')

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
