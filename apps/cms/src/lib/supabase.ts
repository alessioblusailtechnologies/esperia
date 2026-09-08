import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { CommentStatus, ReportReason, ReportStatus } from '@esperia/shared'

/**
 * Accesso alla community dal backoffice — RF-B-10.
 *
 * I commenti vivono nello schema `public` di Supabase, protetto da RLS
 * (vedi docs/architettura.md §2.4). La moderazione deve poter vedere e
 * modificare righe che nessun utente potrebbe toccare, quindi qui usiamo la
 * chiave di servizio, che ignora le policy.
 *
 * Due regole non negoziabili su questo modulo:
 *  1. gira SOLO lato server — la chiave non deve mai raggiungere il browser;
 *  2. ogni operazione passa da funzioni esplicite dichiarate qui sotto, non da
 *     un client generico esportato: così l'insieme di ciò che il backoffice
 *     può fare sulla community è leggibile in un file solo.
 */

let client: SupabaseClient | null = null

function supabase(): SupabaseClient | null {
  if (client) return client

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  // Community non configurata: la moderazione si disattiva con un messaggio,
  // il resto del backoffice continua a funzionare.
  if (!url || !key) return null

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}

export function communityConfigurata(): boolean {
  return supabase() !== null
}

/* -------------------------------------------------------------------------- */
/* Tipi della coda di moderazione                                             */
/* -------------------------------------------------------------------------- */

export interface AutoreCommento {
  id: string
  displayName: string
  avatarUrl: string | null
  isStaff: boolean
  iscrittoIl: string
  bannedAt: string | null
}

export interface VoceModerazione {
  id: string
  articleId: string
  articoloTitolo: string | null
  articoloSlug: string | null
  articoloCategoria: string | null
  autore: AutoreCommento | null
  testo: string
  stato: CommentStatus
  creatoIl: string
  autoFlagged: boolean
  autoFlagReason: string | null
  /** Commento a cui questo risponde, quando è una risposta. */
  genitore: { autore: string | null; testo: string } | null
  /** Presente solo nella scheda "Segnalazioni ricevute". */
  segnalazione: {
    id: string
    motivo: ReportReason
    nota: string | null
    segnalatoDa: string | null
    stato: ReportStatus
    creataIl: string
  } | null
}

export interface ConteggiModerazione {
  inAttesa: number
  segnalazioniAperte: number
}

/* -------------------------------------------------------------------------- */
/* Letture                                                                    */
/* -------------------------------------------------------------------------- */

export async function contaModerazione(): Promise<ConteggiModerazione> {
  const db = supabase()
  if (!db) return { inAttesa: 0, segnalazioniAperte: 0 }

  const [commenti, segnalazioni] = await Promise.all([
    db.from('comments').select('id', { count: 'exact', head: true }).eq('status', 'in_attesa'),
    db.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'aperta'),
  ])

  return {
    inAttesa: commenti.count ?? 0,
    segnalazioniAperte: segnalazioni.count ?? 0,
  }
}

type RigaProfilo = {
  id: string
  display_name: string
  avatar_url: string | null
  is_staff: boolean
  created_at: string
  banned_at: string | null
}

function mappaAutore(p: RigaProfilo | null): AutoreCommento | null {
  if (!p) return null
  return {
    id: p.id,
    displayName: p.display_name,
    avatarUrl: p.avatar_url,
    isStaff: p.is_staff,
    iscrittoIl: p.created_at,
    bannedAt: p.banned_at,
  }
}

const SELECT_COMMENTO =
  'id, article_id, body, status, created_at, auto_flagged, auto_flag_reason, parent_id, profiles(id, display_name, avatar_url, is_staff, created_at, banned_at)'

/** Coda dei commenti in attesa di revisione — scheda 1 della Moderazione. */
export async function commentiInAttesa(limite = 50): Promise<VoceModerazione[]> {
  const db = supabase()
  if (!db) return []

  const { data, error } = await db
    .from('comments')
    .select(SELECT_COMMENTO)
    .eq('status', 'in_attesa')
    .order('created_at', { ascending: true })
    .limit(limite)

  if (error) throw new Error(`Lettura coda commenti fallita: ${error.message}`)

  return arricchisci(db, (data ?? []) as never[], null)
}

/** Segnalazioni ancora aperte, col commento segnalato — scheda 2. */
export async function segnalazioniAperte(limite = 50): Promise<VoceModerazione[]> {
  const db = supabase()
  if (!db) return []

  const { data, error } = await db
    .from('reports')
    .select(
      `id, reason, note, status, created_at,
       reporter:profiles!reports_reporter_id_fkey(display_name),
       comments!inner(${SELECT_COMMENTO})`,
    )
    .eq('status', 'aperta')
    .order('created_at', { ascending: true })
    .limit(limite)

  if (error) throw new Error(`Lettura segnalazioni fallita: ${error.message}`)

  const righe = (data ?? []) as Array<Record<string, any>>
  const commenti = righe.map((r) => r.comments)

  const voci = await arricchisci(db, commenti as never[], null)

  return voci.map((v, i) => {
    const r = righe[i]!
    return {
      ...v,
      segnalazione: {
        id: String(r.id),
        motivo: r.reason as ReportReason,
        nota: r.note ?? null,
        segnalatoDa: r.reporter?.display_name ?? null,
        stato: r.status as ReportStatus,
        creataIl: r.created_at,
      },
    }
  })
}

/**
 * Aggiunge a ogni commento il contesto che la moderazione deve avere sotto gli
 * occhi per decidere: il commento a cui risponde e l'articolo su cui sta.
 * Senza, si giudicherebbe una frase fuori dal suo contesto.
 */
async function arricchisci(
  db: SupabaseClient,
  righe: Array<Record<string, any>>,
  _unused: null,
): Promise<VoceModerazione[]> {
  const idGenitori = righe.map((r) => r.parent_id).filter(Boolean) as string[]

  const genitori = new Map<string, { autore: string | null; testo: string }>()
  if (idGenitori.length > 0) {
    const { data } = await db
      .from('comments')
      .select('id, body, profiles(display_name)')
      .in('id', idGenitori)

    for (const g of (data ?? []) as Array<Record<string, any>>) {
      genitori.set(String(g.id), {
        autore: g.profiles?.display_name ?? null,
        testo: String(g.body ?? ''),
      })
    }
  }

  return righe.map((r) => ({
    id: String(r.id),
    articleId: String(r.article_id),
    // Titolo e categoria dell'articolo li risolve il chiamante lato Payload:
    // stanno in un altro schema e non sono raggiungibili da qui.
    articoloTitolo: null,
    articoloSlug: null,
    articoloCategoria: null,
    autore: mappaAutore(r.profiles ?? null),
    testo: String(r.body ?? ''),
    stato: r.status as CommentStatus,
    creatoIl: r.created_at,
    autoFlagged: Boolean(r.auto_flagged),
    autoFlagReason: r.auto_flag_reason ?? null,
    genitore: r.parent_id ? (genitori.get(String(r.parent_id)) ?? null) : null,
    segnalazione: null,
  }))
}

/* -------------------------------------------------------------------------- */
/* Scritture                                                                  */
/* -------------------------------------------------------------------------- */

export async function decidiCommento(
  commentId: string,
  stato: Extract<CommentStatus, 'approvato' | 'rifiutato' | 'eliminato'>,
): Promise<void> {
  const db = supabase()
  if (!db) throw new Error('Community non configurata.')

  const { error } = await db.from('comments').update({ status: stato }).eq('id', commentId)
  if (error) throw new Error(`Aggiornamento commento fallito: ${error.message}`)

  /*
   * Decidere sul commento chiude anche le segnalazioni che lo riguardano:
   * lasciarle aperte farebbe ricomparire in coda un caso già giudicato.
   */
  await db
    .from('reports')
    .update({
      status: stato === 'approvato' ? 'respinta' : 'accolta',
      resolved_at: new Date().toISOString(),
    })
    .eq('comment_id', commentId)
    .eq('status', 'aperta')
}

export async function bloccaUtente(userId: string, motivo: string): Promise<void> {
  const db = supabase()
  if (!db) throw new Error('Community non configurata.')

  const { error } = await db
    .from('profiles')
    .update({ banned_at: new Date().toISOString(), banned_reason: motivo })
    .eq('id', userId)

  if (error) throw new Error(`Blocco utente fallito: ${error.message}`)
}

export async function sbloccaUtente(userId: string): Promise<void> {
  const db = supabase()
  if (!db) throw new Error('Community non configurata.')

  const { error } = await db
    .from('profiles')
    .update({ banned_at: null, banned_reason: null })
    .eq('id', userId)

  if (error) throw new Error(`Sblocco utente fallito: ${error.message}`)
}
