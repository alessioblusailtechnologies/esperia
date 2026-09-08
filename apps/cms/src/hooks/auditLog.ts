import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

/**
 * Traccia le operazioni rilevanti del backoffice — RNF-08.
 *
 * Registriamo il "chi/cosa/quando" e un diff sintetico, non il documento
 * intero: lo storico completo dei contenuti e' gia' nelle revisioni di Payload
 * (RF-B-13) e duplicarlo qui farebbe crescere la tabella senza motivo.
 */

const IGNORED_KEYS = new Set(['updatedAt', 'createdAt', 'id', '_status'])

function changedKeys(next: Record<string, any>, prev?: Record<string, any>): string[] {
  if (!prev) return []
  return Object.keys(next).filter((k) => {
    if (IGNORED_KEYS.has(k)) return false
    return JSON.stringify(next[k]) !== JSON.stringify(prev[k])
  })
}

export const auditChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
  operation,
  collection,
}) => {
  if (!req.user) return doc // operazioni di sistema (job, seed): non sono azioni di redazione

  try {
    await req.payload.create({
      collection: 'audit-log',
      overrideAccess: true,
      data: {
        action: operation === 'create' ? 'creazione' : 'modifica',
        collectionSlug: collection.slug,
        documentId: String(doc.id),
        documentLabel: doc.title ?? doc.name ?? doc.slug ?? String(doc.id),
        user: req.user.id,
        // Il cambio di stato di pubblicazione e' l'evento che interessa di piu' in audit.
        statusFrom: previousDoc?._status ?? null,
        statusTo: doc?._status ?? null,
        changedFields: changedKeys(doc, previousDoc),
        ip: req.headers?.get?.('x-forwarded-for') ?? null,
      },
    })
  } catch (err) {
    // L'audit non deve mai far fallire l'operazione che sta tracciando.
    req.payload.logger.error(`Scrittura audit-log fallita: ${(err as Error).message}`)
  }

  return doc
}

export const auditDelete: CollectionAfterDeleteHook = async ({ doc, req, collection }) => {
  if (!req.user) return doc
  try {
    await req.payload.create({
      collection: 'audit-log',
      overrideAccess: true,
      data: {
        action: 'eliminazione',
        collectionSlug: collection.slug,
        documentId: String(doc.id),
        documentLabel: doc.title ?? doc.name ?? doc.slug ?? String(doc.id),
        user: req.user.id,
        changedFields: [],
        ip: req.headers?.get?.('x-forwarded-for') ?? null,
      },
    })
  } catch (err) {
    req.payload.logger.error(`Scrittura audit-log fallita: ${(err as Error).message}`)
  }
  return doc
}
