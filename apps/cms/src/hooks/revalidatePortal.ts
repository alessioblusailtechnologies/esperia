import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

/**
 * Notifica al portale Astro che un contenuto e' cambiato, cosi' che invalidi
 * la cache CDN delle pagine coinvolte — RNF-01.
 *
 * Volutamente "best effort": un portale irraggiungibile non deve MAI impedire
 * alla redazione di salvare. Al peggio la pagina resta in cache fino alla
 * scadenza naturale (stale-while-revalidate).
 */
const REVALIDATE_TIMEOUT_MS = 3000

async function notify(paths: string[], payloadLogger: { error: (msg: string) => void }) {
  const base = process.env.PORTAL_URL
  const secret = process.env.PORTAL_REVALIDATE_SECRET
  if (!base || !secret || paths.length === 0) return

  try {
    await fetch(new URL('/api/revalidate', base), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-revalidate-secret': secret },
      body: JSON.stringify({ paths }),
      signal: AbortSignal.timeout(REVALIDATE_TIMEOUT_MS),
    })
  } catch (err) {
    payloadLogger.error(
      `Invalidazione cache portale fallita per ${paths.join(', ')}: ${(err as Error).message}`,
    )
  }
}

/** Costruisce i percorsi da invalidare per un articolo e le sue pagine di listing. */
function articlePaths(doc: Record<string, any>, previous?: Record<string, any>): string[] {
  const paths = new Set<string>(['/', '/sitemap.xml', '/rss.xml'])

  for (const d of [doc, previous]) {
    if (!d?.slug) continue
    paths.add(`/${d.slug}`)
    const cat = typeof d.category === 'object' ? d.category?.slug : null
    if (cat) paths.add(`/categoria/${cat}`)
    const tags = Array.isArray(d.tags) ? d.tags : []
    for (const t of tags) {
      const slug = typeof t === 'object' ? t?.slug : null
      if (slug) paths.add(`/tag/${slug}`)
    }
  }

  return [...paths]
}

export const revalidateArticle: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
  operation,
}) => {
  // Le bozze non sono in cache: invalidare sarebbe rumore inutile.
  const wasPublic = previousDoc?._status === 'published'
  const isPublic = doc?._status === 'published'
  if (!wasPublic && !isPublic) return doc

  req.payload.logger.info(`Invalidazione portale per articolo "${doc.slug}" (${operation}).`)
  await notify(articlePaths(doc, previousDoc), req.payload.logger)
  return doc
}

export const revalidateArticleOnDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  await notify(articlePaths(doc), req.payload.logger)
  return doc
}

/** Categorie, tag, pagine statiche e impostazioni: invalidiamo tutto il portale. */
export const revalidateAll: CollectionAfterChangeHook = async ({ doc, req }) => {
  await notify(['/*'], req.payload.logger)
  return doc
}
