import { defineMiddleware } from 'astro:middleware'
import { getRedirects, getSiteSettings, CmsUnavailableError } from '@/lib/payload'

/**
 * Middleware del portale.
 *
 * Ordine intenzionale:
 *  1. redirect      — devono precedere qualsiasi rendering, altrimenti si
 *                     genererebbe una 404 per una URL che deve reindirizzare;
 *  2. manutenzione;
 *  3. header di cache e sicurezza sulla risposta.
 */

/** Percorsi tecnici: niente redirect ne' manutenzione, ma gli header valgono comunque. */
const TECNICI = ['/_astro/', '/_image', '/api/']

/*
 * Politica di cache condivisa (CDN) per famiglia di rotte.
 *
 * PERCHE' QUI E NON NELLE PAGINE.
 * Astro trasmette la risposta in streaming: gli header impostati durante il
 * rendering di un componente arrivano quando la risposta e' gia' partita e
 * vengono scartati in silenzio — verificato sul campo, il Cache-Control non
 * usciva. Il middleware invece gira prima del rendering, quindi e' l'unico
 * punto in cui la politica e' garantita.
 *
 * Effetto collaterale positivo: la politica di cache dell'intero portale si
 * legge in una tabella sola invece che sparsa in dieci pagine.
 *
 * `stale-while-revalidate` alto e' deliberato: alla pubblicazione il CMS chiama
 * /api/revalidate, quindi non dipendiamo dalla scadenza naturale per vedere i
 * contenuti nuovi. La finestra lunga serve solo a non far mai aspettare un
 * lettore quando il CMS e' lento o irraggiungibile (RNF-01, RNF-10).
 */
const POLITICHE: Array<{ quando: RegExp; sMaxAge: number }> = [
  { quando: /^\/$/, sMaxAge: 120 }, // home: cambia di continuo
  { quando: /^\/categoria\//, sMaxAge: 180 },
  { quando: /^\/tag\//, sMaxAge: 180 },
  { quando: /^\/pagina\//, sMaxAge: 3600 }, // pagine di servizio: quasi statiche
  { quando: /^\/rss\.xml$/, sMaxAge: 900 },
  { quando: /^\/sitemap\.xml$/, sMaxAge: 3600 },
  { quando: /^\/robots\.txt$/, sMaxAge: 3600 },
  { quando: /^\/[^/]+$/, sMaxAge: 600 }, // pagina articolo
]

/** Rotte che non devono MAI finire in una cache condivisa. */
const MAI_IN_CACHE = [/^\/ricerca/, /^\/api\//, /^\/accedi/, /^\/registrati/, /^\/profilo/]

function politicaCache(percorso: string, anteprima: boolean): string {
  if (anteprima || MAI_IN_CACHE.some((r) => r.test(percorso))) {
    return 'private, no-store'
  }

  const trovata = POLITICHE.find((p) => p.quando.test(percorso))
  if (!trovata) return 'private, no-store'

  return `public, max-age=0, s-maxage=${trovata.sMaxAge}, stale-while-revalidate=86400`
}

export const onRequest = defineMiddleware(async (context, next) => {
  const percorso = context.url.pathname
  const tecnico = TECNICI.some((p) => percorso.startsWith(p))

  // Un'anteprima non deve mai essere messa in cache ne' servita ad altri.
  const anteprima =
    context.url.searchParams.get('anteprima') === '1' ||
    context.cookies.get('esperia-anteprima')?.value === '1'

  if (!tecnico) {
    /* --- Redirect gestiti da backoffice — RF-P-07 ------------------------ */
    try {
      const normalizzato =
        percorso.length > 1 && percorso.endsWith('/') ? percorso.slice(0, -1) : percorso

      const redirects = await getRedirects()
      const trovato = redirects.find((r) => r.from === normalizzato)

      if (trovato) {
        const destinazione = trovato.to.startsWith('http')
          ? trovato.to
          : new URL(trovato.to, context.url.origin).toString()
        return context.redirect(destinazione, trovato.type === '302' ? 302 : 301)
      }

      // Uniformiamo lo slash finale: /articolo/ e /articolo sono la stessa
      // pagina, e servirle entrambe crea contenuto duplicato.
      if (normalizzato !== percorso) {
        return context.redirect(normalizzato + context.url.search, 301)
      }
    } catch (err) {
      // Redirect non recuperabili: proseguiamo comunque. Meglio una 404 su una
      // URL vecchia che un portale interamente fuori servizio (RNF-10).
      if (!(err instanceof CmsUnavailableError)) throw err
    }

    /* --- Manutenzione ---------------------------------------------------- */
    try {
      const settings = await getSiteSettings()
      if (settings.maintenanceMode) {
        return new Response(
          `<!doctype html><html lang="it"><head><meta charset="utf-8">
           <meta name="viewport" content="width=device-width,initial-scale=1">
           <title>Manutenzione in corso</title>
           <style>body{font-family:system-ui,sans-serif;max-width:34rem;margin:20vh auto;padding:0 1.5rem;line-height:1.6}</style>
           </head><body><h1>Manutenzione in corso</h1><p>${
             settings.maintenanceMessage ?? 'Torniamo online a breve.'
           }</p></body></html>`,
          {
            status: 503,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Retry-After': '600',
              'Cache-Control': 'no-store',
            },
          },
        )
      }
    } catch (err) {
      if (!(err instanceof CmsUnavailableError)) throw err
    }
  }

  const risposta = await next()

  /* --- Cache — RNF-01 ----------------------------------------------------- */
  // Solo le risposte riuscite vanno in cache condivisa: un 404 o un 503
  // memorizzato dalla CDN si trascina molto oltre la causa che l'ha prodotto.
  if (!risposta.headers.has('Cache-Control')) {
    risposta.headers.set(
      'Cache-Control',
      risposta.status === 200 ? politicaCache(percorso, anteprima) : 'private, no-store',
    )
  }

  /* --- Sicurezza — RNF-03 ------------------------------------------------- */
  risposta.headers.set('X-Content-Type-Options', 'nosniff')
  risposta.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  risposta.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  risposta.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')

  // L'anteprima del backoffice incorpora il portale in un iframe da un'altra
  // origine: solo li' allentiamo il divieto di framing.
  risposta.headers.set('X-Frame-Options', anteprima ? 'ALLOWALL' : 'SAMEORIGIN')

  return risposta
})
