import type { APIRoute } from 'astro'
import { absoluteUrl, SITE_URL } from '@/lib/seo'
import { MOCK } from '@/lib/modalita'

/**
 * robots.txt — RF-P-07.
 *
 * In ambienti diversi da quello di produzione blocchiamo tutto: un ambiente di
 * collaudo indicizzato genera contenuti duplicati e cannibalizza il sito vero.
 */
export const GET: APIRoute = () => {
  /*
   * La versione dimostrativa non va indicizzata MAI, nemmeno se pubblicata su
   * un dominio dall'aria definitiva: contiene articoli inventati, e un motore
   * di ricerca che li raccogliesse li presenterebbe come notizie.
   */
  const produzione =
    !MOCK &&
    import.meta.env.PROD &&
    !SITE_URL.includes('localhost') &&
    !SITE_URL.includes('staging')

  const righe = produzione
    ? [
        'User-agent: *',
        'Allow: /',
        '',
        '# Le pagine di ricerca generano URL infinite di scarso valore.',
        'Disallow: /ricerca',
        'Disallow: /api/',
        '',
        `Sitemap: ${absoluteUrl('/sitemap.xml')}`,
      ]
    : ['User-agent: *', 'Disallow: /']

  return new Response(righe.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
