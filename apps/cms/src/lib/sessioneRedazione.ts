import { headers as intestazioni } from 'next/headers'
import { getPayload } from 'payload'
import { roleAtLeast, type StaffRole } from '@esperia/shared'

import config from '@/payload.config'

/**
 * Utente di redazione della richiesta corrente, per le server action.
 *
 * Sta fuori dai file 'use server' di proposito: li' ogni funzione esportata
 * diventa un endpoint richiamabile dal browser, e questa non deve esserlo.
 */
export async function redattoreCorrente(): Promise<
  { ok: true; utente: { id: string; role?: StaffRole } } | { ok: false; messaggio: string }
> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await intestazioni() })

  if (!user) return { ok: false, messaggio: 'Sessione scaduta. Rientra nel backoffice.' }

  const staff = user as unknown as { id: string; role?: StaffRole; active?: boolean }
  if (staff.active === false) return { ok: false, messaggio: 'Account disattivato.' }
  if (!roleAtLeast(staff.role, 'redattore')) {
    return { ok: false, messaggio: 'Permessi insufficienti.' }
  }

  return { ok: true, utente: staff }
}
