import type { Access, FieldAccess, Where } from 'payload'
import { roleAtLeast, type StaffRole } from '@esperia/shared'

/**
 * Access control del backoffice — RF-B-02.
 *
 * Payload valuta l'access control su OGNI operazione, anche quelle interne
 * (Local API). Le funzioni che restituiscono un `Where` fanno filtrare il DB,
 * non l'applicazione: e' quello che rende sicura la lettura pubblica via REST.
 */

type StaffUser = { id: string; role?: StaffRole | null; active?: boolean | null } | null | undefined

const userOf = (req: { user?: unknown }): StaffUser => req.user as StaffUser

/** Un account disattivato non conta come autenticato. RF-B-11 */
const isActive = (u: StaffUser): boolean => Boolean(u && u.active !== false)

/* -------------------------------------------------------------------------- */
/* Primitive                                                                   */
/* -------------------------------------------------------------------------- */

export const anyone: Access = () => true

export const authenticated: Access = ({ req }) => isActive(userOf(req))

export const isAdmin: Access = ({ req }) => {
  const u = userOf(req)
  return isActive(u) && roleAtLeast(u?.role, 'admin')
}

export const isEditor: Access = ({ req }) => {
  const u = userOf(req)
  return isActive(u) && roleAtLeast(u?.role, 'editor')
}

export const isAdminField: FieldAccess = ({ req }) => {
  const u = userOf(req)
  return isActive(u) && roleAtLeast(u?.role, 'admin')
}

export const isEditorField: FieldAccess = ({ req }) => {
  const u = userOf(req)
  return isActive(u) && roleAtLeast(u?.role, 'editor')
}

/* -------------------------------------------------------------------------- */
/* Contenuti pubblicabili                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Lettura: lo staff vede tutto, il pubblico solo cio' che e' pubblicato e
 * la cui data di pubblicazione non e' nel futuro.
 *
 * Il secondo vincolo e' ridondante rispetto a schedulePublish (che tiene il
 * documento in draft fino allo scatto del job) ma protegge dal caso in cui
 * qualcuno imposti a mano una publishedAt futura su un documento gia' pubblicato.
 * RF-P-04, RF-B-06.
 */
export const publishedOrStaff: Access = ({ req }) => {
  if (isActive(userOf(req))) return true

  const now = new Date().toISOString()
  const where: Where = {
    and: [{ _status: { equals: 'published' } }, { publishedAt: { less_than_equal: now } }],
  }
  return where
}

/** Variante per collection senza `publishedAt` (pagine statiche, redirect). */
export const publishedOrStaffSimple: Access = ({ req }) => {
  if (isActive(userOf(req))) return true
  const where: Where = { _status: { equals: 'published' } }
  return where
}

/* -------------------------------------------------------------------------- */
/* Articoli — RF-B-03 / RF-B-05                                               */
/* -------------------------------------------------------------------------- */

/**
 * Il redattore puo' modificare solo i propri articoli, e solo finche' non
 * sono stati approvati. Da `approvato` in poi il documento e' in mano
 * all'editor: e' il gate del workflow, non una cortesia dell'interfaccia.
 */
export const canUpdateArticle: Access = ({ req }) => {
  const u = userOf(req)
  if (!isActive(u)) return false
  if (roleAtLeast(u?.role, 'editor')) return true

  const where: Where = {
    and: [
      { authors: { contains: u!.id } },
      { editorialStatus: { not_equals: 'approvato' } },
      { _status: { not_equals: 'published' } },
    ],
  }
  return where
}

/** Creare articoli e' concesso a tutto lo staff attivo. */
export const canCreateArticle: Access = ({ req }) => isActive(userOf(req))

/**
 * Cancellazione: solo editor e admin. Il redattore archivia (RF-B-03),
 * non elimina — cosi' non si perdono revisioni gia' approvate.
 */
export const canDeleteArticle: Access = isEditor

/* -------------------------------------------------------------------------- */
/* Utenti di backoffice — RF-B-11                                             */
/* -------------------------------------------------------------------------- */

/** Ognuno legge se stesso; l'admin legge tutti; lo staff vede la rubrica base. */
export const canReadUser: Access = ({ req }) => isActive(userOf(req))

export const canUpdateUser: Access = ({ req }) => {
  const u = userOf(req)
  if (!isActive(u)) return false
  if (roleAtLeast(u?.role, 'admin')) return true
  const where: Where = { id: { equals: u!.id } }
  return where
}
