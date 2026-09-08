/**
 * Tipi della sezione community.
 *
 * Questi dati NON vivono in Payload: stanno nello schema `public` di Supabase,
 * protetti da RLS, e vengono scritti direttamente dal portale con la chiave anon.
 * Vedi supabase/migrations/0001_community.sql e docs/adr/0002-community-su-supabase.md
 */

/* -------------------------------------------------------------------------- */
/* Profilo — RF-C-02                                                          */
/* -------------------------------------------------------------------------- */

export interface CommunityProfile {
  id: string
  displayName: string
  avatarUrl: string | null
  bio: string | null
  /** Mostra il distintivo "Redazione" accanto al nome. */
  isStaff: boolean
  /** Impostato dalla moderazione: l'utente non puo' piu' commentare. RF-B-10 */
  bannedAt: string | null
  bannedReason: string | null
  /** Richiesta di cancellazione account. RF-C-07 */
  deletionRequestedAt: string | null
  createdAt: string
}

/* -------------------------------------------------------------------------- */
/* Commenti — RF-C-03                                                         */
/* -------------------------------------------------------------------------- */

export const COMMENT_STATUSES = ['in_attesa', 'approvato', 'rifiutato', 'eliminato'] as const
export type CommentStatus = (typeof COMMENT_STATUSES)[number]

export const COMMENT_STATUS_LABELS: Record<CommentStatus, string> = {
  in_attesa: 'In attesa',
  approvato: 'Approvato',
  rifiutato: 'Rifiutato',
  eliminato: 'Eliminato',
}

export interface CommunityComment {
  id: string
  articleId: string
  authorId: string | null
  /** Un solo livello di annidamento: se parentId e' valorizzato, e' una risposta. RF-C-03 */
  parentId: string | null
  body: string
  status: CommentStatus
  /** Esito delle regole automatiche anti-spam. RF-C-06 */
  autoFlagged: boolean
  autoFlagReason: string | null
  createdAt: string
  updatedAt: string
  editedAt: string | null
}

/** RF-C-03: risposte annidate a un solo livello. */
export const MAX_COMMENT_DEPTH = 1
export const COMMENT_MAX_LENGTH = 1500
export const COMMENT_MIN_LENGTH = 2

/* -------------------------------------------------------------------------- */
/* Reazioni — RF-C-04                                                         */
/* -------------------------------------------------------------------------- */

export const REACTION_TYPES = ['mi_piace', 'utile', 'non_daccordo'] as const
export type ReactionType = (typeof REACTION_TYPES)[number]

export const REACTION_LABELS: Record<ReactionType, string> = {
  mi_piace: 'Mi piace',
  utile: 'Utile',
  non_daccordo: 'Non sono d’accordo',
}

export type ReactionTarget = 'article' | 'comment'

export interface CommunityReaction {
  id: string
  targetType: ReactionTarget
  targetId: string
  userId: string
  type: ReactionType
  createdAt: string
}

/* -------------------------------------------------------------------------- */
/* Segnalazioni — RF-C-05                                                     */
/* -------------------------------------------------------------------------- */

export const REPORT_REASONS = [
  'spam',
  'offensivo',
  'disinformazione',
  'fuori_tema',
  'altro',
] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Spam o pubblicità',
  offensivo: 'Linguaggio offensivo o odio',
  disinformazione: 'Informazione falsa o fuorviante',
  fuori_tema: 'Fuori tema',
  altro: 'Altro',
}

export const REPORT_STATUSES = ['aperta', 'accolta', 'respinta'] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]

export interface CommunityReport {
  id: string
  commentId: string
  reporterId: string | null
  reason: ReportReason
  note: string | null
  status: ReportStatus
  /** id dell'utente di backoffice che ha gestito la segnalazione. */
  resolvedBy: string | null
  resolvedAt: string | null
  createdAt: string
}
