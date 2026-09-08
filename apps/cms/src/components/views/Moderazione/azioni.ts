'use server'

import { headers as intestazioni } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getPayload } from 'payload'
import { roleAtLeast, type StaffRole } from '@esperia/shared'

import config from '@/payload.config'
import { bloccaUtente, decidiCommento } from '@/lib/supabase'

/**
 * Azioni della coda di moderazione — RF-B-10.
 *
 * ATTENZIONE, PUNTO DI SICUREZZA. Una server action di Next è a tutti gli
 * effetti un endpoint HTTP pubblico: il fatto che sia richiamabile solo da un
 * bottone dell'interfaccia non protegge nulla. Ogni azione qui sotto verifica
 * quindi da sé la sessione e il ruolo, senza dare per scontato che chi la
 * chiama sia passato dal backoffice.
 */

type Esito = { ok: true } | { ok: false; messaggio: string }

async function editorCorrente(): Promise<
  { ok: true; utente: { id: string; role?: StaffRole } } | { ok: false; messaggio: string }
> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await intestazioni() })

  if (!user) return { ok: false, messaggio: 'Sessione scaduta. Rientra nel backoffice.' }

  const staff = user as unknown as { id: string; role?: StaffRole; active?: boolean }
  if (staff.active === false) {
    return { ok: false, messaggio: 'Account disattivato.' }
  }
  if (!roleAtLeast(staff.role, 'editor')) {
    return { ok: false, messaggio: 'La moderazione è riservata a Editor e Amministratori.' }
  }

  return { ok: true, utente: staff }
}

/** Traccia la decisione nel registro operazioni, così resta chi ha deciso cosa (RNF-08). */
async function registra(
  utenteId: string,
  azione: string,
  documento: string,
  etichetta: string,
): Promise<void> {
  try {
    const payload = await getPayload({ config })
    await payload.create({
      collection: 'audit-log',
      overrideAccess: true,
      data: {
        action: 'modifica',
        collectionSlug: 'community',
        documentId: documento,
        documentLabel: `${azione}: ${etichetta}`,
        user: utenteId,
        changedFields: [azione],
      },
    })
  } catch {
    // Il registro non deve far fallire la moderazione che sta tracciando.
  }
}

export async function approvaCommento(commentId: string, anteprima: string): Promise<Esito> {
  const sessione = await editorCorrente()
  if (!sessione.ok) return sessione

  try {
    await decidiCommento(commentId, 'approvato')
    await registra(sessione.utente.id, 'commento approvato', commentId, anteprima)
    revalidatePath('/admin/moderazione')
    return { ok: true }
  } catch (err) {
    return { ok: false, messaggio: (err as Error).message }
  }
}

export async function rifiutaCommento(commentId: string, anteprima: string): Promise<Esito> {
  const sessione = await editorCorrente()
  if (!sessione.ok) return sessione

  try {
    await decidiCommento(commentId, 'rifiutato')
    await registra(sessione.utente.id, 'commento rifiutato', commentId, anteprima)
    revalidatePath('/admin/moderazione')
    return { ok: true }
  } catch (err) {
    return { ok: false, messaggio: (err as Error).message }
  }
}

export async function eliminaCommento(commentId: string, anteprima: string): Promise<Esito> {
  const sessione = await editorCorrente()
  if (!sessione.ok) return sessione

  try {
    // "Eliminato" è uno stato, non una cancellazione: le segnalazioni collegate
    // devono restare consultabili e i thread non devono spezzarsi.
    await decidiCommento(commentId, 'eliminato')
    await registra(sessione.utente.id, 'commento eliminato', commentId, anteprima)
    revalidatePath('/admin/moderazione')
    return { ok: true }
  } catch (err) {
    return { ok: false, messaggio: (err as Error).message }
  }
}

export async function bloccaAutore(
  userId: string,
  nome: string,
  motivo: string,
): Promise<Esito> {
  const sessione = await editorCorrente()
  if (!sessione.ok) return sessione

  if (!motivo.trim()) {
    return { ok: false, messaggio: 'Indica una motivazione: resta agli atti.' }
  }

  try {
    await bloccaUtente(userId, motivo.trim())
    await registra(sessione.utente.id, 'utente bloccato', userId, nome)
    revalidatePath('/admin/moderazione')
    return { ok: true }
  } catch (err) {
    return { ok: false, messaggio: (err as Error).message }
  }
}

/** Decisione su più commenti in un colpo solo, dalla barra di selezione. */
export async function decidiInBlocco(
  ids: string[],
  decisione: 'approvato' | 'rifiutato' | 'eliminato',
): Promise<Esito & { riusciti?: number }> {
  const sessione = await editorCorrente()
  if (!sessione.ok) return sessione

  let riusciti = 0
  for (const id of ids) {
    try {
      await decidiCommento(id, decisione)
      riusciti++
    } catch {
      // Un commento già rimosso da un altro editor non deve far fallire il resto.
    }
  }

  await registra(
    sessione.utente.id,
    `decisione in blocco (${decisione})`,
    ids.join(','),
    `${riusciti} commenti`,
  )
  revalidatePath('/admin/moderazione')

  return riusciti === ids.length
    ? { ok: true, riusciti }
    : { ok: false, messaggio: `Applicata a ${riusciti} commenti su ${ids.length}.`, riusciti }
}
