import { APIError, type CollectionBeforeChangeHook } from 'payload'
import { canTransition, roleAtLeast, type EditorialStatus, type StaffRole } from '@esperia/shared'

/**
 * Fa rispettare il workflow editoriale a livello di dato — RF-B-05.
 *
 * Nascondere i pulsanti in interfaccia non e' controllo di accesso: chiunque
 * abbia un token valido puo' chiamare la REST API. Le regole stanno qui, dove
 * passa ogni scrittura (admin, REST, GraphQL e Local API).
 */
export const enforceWorkflow: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  const user = req.user as { id: string; role?: StaffRole | null } | undefined
  const role = user?.role

  const previousStatus = (originalDoc?.editorialStatus ?? 'bozza') as EditorialStatus
  const nextStatus = (data.editorialStatus ?? previousStatus) as EditorialStatus

  // 1. La transizione di stato editoriale deve essere ammessa per il ruolo.
  if (operation === 'update' && nextStatus !== previousStatus) {
    if (!canTransition(previousStatus, nextStatus, role)) {
      throw new APIError(
        `Passaggio da "${previousStatus}" a "${nextStatus}" non consentito per il ruolo corrente.`,
        403,
      )
    }
  }

  // 2. Un articolo generato dall'AI nasce sempre in bozza — RF-AI-08.
  if (operation === 'create' && data.ai?.origin && data.ai.origin !== 'manuale') {
    data.editorialStatus = 'bozza'
    data._status = 'draft'
  }

  // 3. La pubblicazione richiede stato "approvato" e ruolo editor — RF-B-05.
  const isPublishing = data._status === 'published' && originalDoc?._status !== 'published'
  if (isPublishing) {
    if (!roleAtLeast(role, 'editor')) {
      throw new APIError('Solo Editor e Amministratori possono pubblicare un articolo.', 403)
    }
    if (nextStatus !== 'approvato') {
      throw new APIError(
        'L’articolo deve essere in stato "Approvato" prima della pubblicazione.',
        400,
      )
    }
    // Prima pubblicazione: fissiamo la data se la redazione non l'ha impostata.
    if (!data.publishedAt && !originalDoc?.publishedAt) {
      data.publishedAt = new Date().toISOString()
    }
  }

  // 4. Depubblicare e' una scelta reversibile, ma resta riservata all'editor.
  const isUnpublishing = originalDoc?._status === 'published' && data._status === 'draft'
  if (isUnpublishing && !roleAtLeast(role, 'editor')) {
    throw new APIError('Solo Editor e Amministratori possono ritirare un articolo pubblicato.', 403)
  }

  // 5. Chi crea un articolo ne e' autore di default — RF-AI-08 (attribuzione al richiedente).
  if (operation === 'create' && user?.id) {
    const authors = data.authors as unknown
    if (!Array.isArray(authors) || authors.length === 0) {
      data.authors = [user.id]
    }
  }

  return data
}
