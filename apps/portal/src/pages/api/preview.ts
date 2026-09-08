import type { APIRoute } from 'astro'

export const prerender = false

/**
 * Anteprima delle bozze dal backoffice — RF-B-04.
 *
 * Il CMS apre questa URL in un iframe (live preview). Verifichiamo il segreto
 * condiviso e impostiamo un cookie di sessione: e' il cookie che autorizza
 * [slug].astro a mostrare una bozza invece del solo contenuto pubblicato.
 */
export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const atteso = import.meta.env.PORTAL_REVALIDATE_SECRET
  const fornito = url.searchParams.get('secret')
  const slug = url.searchParams.get('slug')

  if (!atteso || fornito !== atteso) {
    return new Response('Non autorizzato', { status: 401 })
  }

  if (!slug) {
    return new Response('Parametro slug mancante', { status: 400 })
  }

  cookies.set('esperia-anteprima', '1', {
    httpOnly: true,
    sameSite: 'none', // il CMS incorpora il portale in un iframe da un'altra origine
    secure: import.meta.env.PROD,
    path: '/',
    maxAge: 60 * 60, // un'ora: il tempo di una sessione di revisione
  })

  return redirect(`/${slug}?anteprima=1`, 307)
}
