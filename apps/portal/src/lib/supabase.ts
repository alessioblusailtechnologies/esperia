import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Client Supabase per la sezione community.
 *
 * Gira nel browser con la chiave anon, che e' pubblica per progetto: la
 * sicurezza non viene dal tenerla nascosta ma dalle policy RLS in
 * supabase/migrations/0001_community.sql. Ogni regola su chi puo' leggere,
 * scrivere o modificare un commento e' applicata dal database.
 */

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (client) return client

  const url = import.meta.env.PUBLIC_SUPABASE_URL
  const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY

  // Community non configurata: le funzioni corrispondenti si disattivano con
  // un messaggio, il resto del portale continua a funzionare.
  if (!url || !key) return null

  client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  return client
}

export interface CommentoConAutore {
  id: string
  article_id: string
  author_id: string | null
  parent_id: string | null
  body: string
  status: 'in_attesa' | 'approvato' | 'rifiutato' | 'eliminato'
  created_at: string
  edited_at: string | null
  profiles: { display_name: string; avatar_url: string | null; is_staff: boolean } | null
  /** Conteggio dei "mi piace", aggregato dalla vista reaction_counts. */
  mi_piace?: number
  /** Vero se l'utente corrente ha gia' messo "mi piace". */
  mio_mi_piace?: boolean
}
