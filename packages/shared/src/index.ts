/**
 * Costanti e tipi di dominio condivisi tra il CMS (Payload) e il portale (Astro).
 *
 * Regola: qui dentro non entrano dipendenze runtime. Solo tipi e valori puri,
 * cosi' il pacchetto e' importabile sia da un contesto Node che da un'isola browser.
 */

export * from './community'

/* -------------------------------------------------------------------------- */
/* Ruoli di backoffice — RF-B-02                                              */
/* -------------------------------------------------------------------------- */

export const STAFF_ROLES = ['redattore', 'editor', 'admin'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  redattore: 'Redattore',
  editor: 'Editor / Caporedattore',
  admin: 'Amministratore',
}

/** Gerarchia dei ruoli: un ruolo eredita i permessi di quelli con rank inferiore. */
const ROLE_RANK: Record<StaffRole, number> = { redattore: 1, editor: 2, admin: 3 }

export function roleAtLeast(role: StaffRole | undefined | null, min: StaffRole): boolean {
  if (!role) return false
  return ROLE_RANK[role] >= ROLE_RANK[min]
}

/* -------------------------------------------------------------------------- */
/* Workflow editoriale — RF-B-05                                              */
/* -------------------------------------------------------------------------- */

/**
 * Lo stato editoriale e' ortogonale a `_status` di Payload (draft | published).
 *
 *   bozza --> in_revisione --> approvato --> [_status: published | programmato]
 *
 * `approvato` e' il gate: nessun articolo passa a `_status: published`
 * senza essere prima `approvato`. Vedi apps/cms/src/hooks/enforceWorkflow.ts
 */
export const EDITORIAL_STATUSES = ['bozza', 'in_revisione', 'approvato'] as const
export type EditorialStatus = (typeof EDITORIAL_STATUSES)[number]

export const EDITORIAL_STATUS_LABELS: Record<EditorialStatus, string> = {
  bozza: 'Bozza',
  in_revisione: 'In revisione',
  approvato: 'Approvato',
}

/** Transizioni ammesse e ruolo minimo richiesto per ciascuna. */
export const WORKFLOW_TRANSITIONS: Array<{
  from: EditorialStatus
  to: EditorialStatus
  minRole: StaffRole
}> = [
  { from: 'bozza', to: 'in_revisione', minRole: 'redattore' },
  { from: 'in_revisione', to: 'bozza', minRole: 'redattore' },
  { from: 'in_revisione', to: 'approvato', minRole: 'editor' },
  { from: 'approvato', to: 'in_revisione', minRole: 'editor' },
  { from: 'approvato', to: 'bozza', minRole: 'editor' },
]

export function canTransition(
  from: EditorialStatus,
  to: EditorialStatus,
  role: StaffRole | undefined | null,
): boolean {
  if (from === to) return true
  const t = WORKFLOW_TRANSITIONS.find((x) => x.from === from && x.to === to)
  if (!t) return false
  return roleAtLeast(role, t.minRole)
}

/* -------------------------------------------------------------------------- */
/* Provenienza AI — RF-AI-11                                                  */
/* -------------------------------------------------------------------------- */

export const AI_ORIGINS = ['manuale', 'hot_topic', 'brief', 'assistenza_editing'] as const
export type AiOrigin = (typeof AI_ORIGINS)[number]

export const AI_OPERATIONS = [
  'hot_topic_ranking',
  'draft_from_topic',
  'draft_from_brief',
  'rewrite',
  'summarize',
  'title_suggestions',
  'seo_suggestions',
  'image_generation',
  'comment_moderation',
] as const
export type AiOperation = (typeof AI_OPERATIONS)[number]

/* -------------------------------------------------------------------------- */
/* Hot topic — RF-AI-02                                                       */
/* -------------------------------------------------------------------------- */

export const HOT_TOPIC_STATUSES = ['nuovo', 'in_lavorazione', 'convertito', 'scartato'] as const
export type HotTopicStatus = (typeof HOT_TOPIC_STATUSES)[number]

/* -------------------------------------------------------------------------- */
/* SEO — RF-P-07 / RF-B-09                                                    */
/* -------------------------------------------------------------------------- */

export const SEO_LIMITS = {
  metaTitle: 60,
  metaDescription: 160,
  /** Oltre questa soglia Google tronca lo slug nelle breadcrumb. */
  slug: 75,
} as const

/** Slugify conservativo per l'italiano: niente translitterazioni esotiche. */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SEO_LIMITS.slug)
    .replace(/-+$/g, '')
}

/* -------------------------------------------------------------------------- */
/* Stato mostrato in backoffice                                               */
/*                                                                            */
/* I design del backoffice espongono cinque stati, mentre nel dato ce ne sono */
/* due assi indipendenti: lo stato editoriale (RF-B-05) e lo stato di         */
/* pubblicazione di Payload. Questa funzione li fonde in ciò che la redazione */
/* si aspetta di leggere in una pastiglia sola.                               */
/* -------------------------------------------------------------------------- */

export const STATI_VISIBILI = [
  'bozza',
  'revisione',
  'approvato',
  'programmato',
  'pubblicato',
] as const
export type StatoVisibile = (typeof STATI_VISIBILI)[number]

export const STATO_VISIBILE_LABEL: Record<StatoVisibile, string> = {
  bozza: 'Bozza',
  revisione: 'In revisione',
  approvato: 'Approvato',
  programmato: 'Programmato',
  pubblicato: 'Pubblicato',
}

export function statoVisibile(articolo: {
  _status?: string | null
  editorialStatus?: string | null
  publishedAt?: string | null
}): StatoVisibile {
  if (articolo._status === 'published') return 'pubblicato'

  /*
   * "Programmato" non è un valore memorizzato: è un articolo approvato, non
   * ancora pubblicato, con una data futura. Ricavarlo invece di aggiungere una
   * colonna evita che il dato possa contraddire la realtà — la pastiglia dice
   * sempre quello che il documento è, non quello che qualcuno ha scritto che è.
   */
  if (articolo.editorialStatus === 'approvato' && articolo.publishedAt) {
    if (new Date(articolo.publishedAt).getTime() > Date.now()) return 'programmato'
  }

  if (articolo.editorialStatus === 'approvato') return 'approvato'
  if (articolo.editorialStatus === 'in_revisione') return 'revisione'
  return 'bozza'
}
