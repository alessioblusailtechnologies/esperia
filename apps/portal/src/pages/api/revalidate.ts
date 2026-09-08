import type { APIRoute } from 'astro'
import { clearCmsCache } from '@/lib/payload'

export const prerender = false

/**
 * Invalidazione della cache su richiesta del CMS — RNF-01.
 *
 * Il CMS chiama questo endpoint quando un contenuto cambia (vedi
 * apps/cms/src/hooks/revalidatePortal.ts). Facciamo due cose:
 *  1. svuotiamo la cache di processo del portale (impostazioni, menu, redirect);
 *  2. rispondiamo con i percorsi da purgare, che l'infrastruttura CDN puo'
 *     inoltrare al proprio meccanismo di purge.
 *
 * Il passo 2 e' volutamente astratto: l'hosting non e' ancora deciso (V-02) e
 * ogni CDN ha una sua API di purge. Il gancio e' qui, pronto.
 */
export const POST: APIRoute = async ({ request }) => {
  const atteso = import.meta.env.PORTAL_REVALIDATE_SECRET

  if (!atteso) {
    return Response.json(
      { ok: false, errore: 'PORTAL_REVALIDATE_SECRET non configurato sul portale.' },
      { status: 503 },
    )
  }

  const fornito = request.headers.get('x-revalidate-secret')
  if (fornito !== atteso) {
    // Nessun dettaglio sul perche': non aiutiamo chi sta tentando.
    return Response.json({ ok: false }, { status: 401 })
  }

  let percorsi: string[] = []
  try {
    const body = (await request.json()) as { paths?: unknown }
    if (Array.isArray(body.paths)) {
      percorsi = body.paths.filter((p): p is string => typeof p === 'string')
    }
  } catch {
    return Response.json({ ok: false, errore: 'Corpo della richiesta non valido.' }, { status: 400 })
  }

  clearCmsCache()

  console.info(`[revalidate] cache svuotata, percorsi segnalati: ${percorsi.join(', ') || 'nessuno'}`)

  return Response.json({ ok: true, invalidati: percorsi })
}
