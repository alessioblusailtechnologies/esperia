import type { APIRoute } from 'astro'
import { COOKIE_ANTEPRIMA, creaValoreAnteprima } from '@/lib/anteprima'

export const prerender = false

/**
 * Anteprima delle bozze dal backoffice — RF-B-04.
 *
 * Il CMS apre questa URL in un iframe (anteprima dal vivo) o in una nuova
 * scheda (anteprima). Verifichiamo il segreto condiviso e impostiamo un cookie
 * firmato (lib/anteprima.ts): è il cookie che autorizza [slug].astro a
 * mostrare una bozza invece del solo contenuto pubblicato.
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

  const anteprima = creaValoreAnteprima()
  if (!anteprima) return new Response('Anteprima non configurata', { status: 503 })

  cookies.set(COOKIE_ANTEPRIMA, anteprima.valore, {
    httpOnly: true,
    // Il CMS incorpora il portale in un iframe da un altro sito: serve
    // SameSite=None, che i browser accettano solo con Secure. Su localhost
    // Secure è ammesso anche in http, quindi vale anche in sviluppo.
    sameSite: 'none',
    secure: true,
    path: '/',
    maxAge: anteprima.maxAge,
  })

  return redirect(`/${slug}?anteprima=1`, 307)
}
