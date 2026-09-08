'use server'

import { headers as intestazioni } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getPayload } from 'payload'
import { roleAtLeast, type StaffRole } from '@esperia/shared'

import config from '@/payload.config'
import { generaBozza, type BozzaGenerata } from '@/lib/ai/genera'
import { creaBozzaDaProposta } from '@/lib/ai/creaBozza'
import { leggiConfigurazione } from '@/lib/ai/client'

/**
 * Azioni dell'assistente per il backoffice — RF-AI-04, RF-AI-05, RF-AI-08.
 *
 * Il flusso e' in due tempi, come nei design: prima si CHIEDE una proposta e la
 * si legge, poi — se convince, e dopo averla eventualmente corretta — la si
 * porta in bozza. Fra i due passaggi non viene salvato nulla: e' quello che
 * rende reale la revisione umana invece di dichiararla.
 *
 * Come per la moderazione, ogni azione verifica sessione e ruolo per conto
 * proprio: una server action e' un endpoint pubblico a tutti gli effetti.
 */

type Esito<T> = { ok: true; dati: T } | { ok: false; messaggio: string }

async function redattoreCorrente(): Promise<
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

const PARAGRAFI_PER_LUNGHEZZA: Record<string, number> = {
  breve: 4,
  media: 7,
  lunga: 12,
}

export interface Proposta extends BozzaGenerata {
  /** Modello usato, per la tracciabilità sull'articolo (RF-AI-11). */
  modello: string
}

/* -------------------------------------------------------------------------- */
/* Proposta da brief — RF-AI-05                                               */
/* -------------------------------------------------------------------------- */

export async function proponiDaBrief(input: {
  brief: string
  lunghezza?: string
  taglio?: string
}): Promise<Esito<Proposta>> {
  const sessione = await redattoreCorrente()
  if (!sessione.ok) return sessione

  const brief = input.brief.trim()
  if (brief.length < 20) {
    return {
      ok: false,
      messaggio: 'Il brief è troppo scarno: descrivi almeno il fatto e il contesto.',
    }
  }

  const payload = await getPayload({ config })
  const conf = await leggiConfigurazione(payload)

  const contesto = [
    brief,
    input.taglio ? `\n\nTaglio richiesto: ${input.taglio}.` : '',
  ].join('')

  const esito = await generaBozza(
    { payload, utenteId: sessione.utente.id },
    { contesto, lunghezzaParagrafi: PARAGRAFI_PER_LUNGHEZZA[input.lunghezza ?? 'media'] ?? 7 },
    'draft_from_brief',
  )

  if (!esito.ok) return { ok: false, messaggio: esito.messaggio }

  return { ok: true, dati: { ...esito.dati, modello: conf.textModel } }
}

/* -------------------------------------------------------------------------- */
/* Proposta da hot topic — RF-AI-04                                           */
/* -------------------------------------------------------------------------- */

export async function proponiDaHotTopic(
  hotTopicId: string,
  indicazioni?: string,
): Promise<Esito<Proposta>> {
  const sessione = await redattoreCorrente()
  if (!sessione.ok) return sessione

  const payload = await getPayload({ config })

  let topic: Record<string, any>
  try {
    topic = (await payload.findByID({
      collection: 'hot-topics',
      id: hotTopicId,
      depth: 1,
      overrideAccess: true,
    })) as Record<string, any>
  } catch {
    return { ok: false, messaggio: 'Argomento non trovato.' }
  }

  const conf = await leggiConfigurazione(payload)

  const contesto = [
    `Argomento: ${topic.title}`,
    topic.summary ? `\nSintesi delle fonti: ${topic.summary}` : '',
    Array.isArray(topic.keywords) && topic.keywords.length
      ? `\nParole chiave ricorrenti: ${topic.keywords.join(', ')}`
      : '',
    indicazioni ? `\n\nIndicazioni del redattore: ${indicazioni}` : '',
  ].join('')

  const fonti = (topic.references ?? []).map((r: Record<string, any>) => ({
    titolo: String(r.title ?? ''),
    url: String(r.url ?? ''),
    testata: r.publisher ? String(r.publisher) : undefined,
  }))

  const esito = await generaBozza(
    { payload, utenteId: sessione.utente.id },
    { contesto, fonti },
    'draft_from_topic',
  )

  if (!esito.ok) return { ok: false, messaggio: esito.messaggio }

  // L'argomento passa "in lavorazione": segnala agli altri che qualcuno ci sta
  // già mettendo mano, così due redattori non scrivono lo stesso pezzo.
  try {
    await payload.update({
      collection: 'hot-topics',
      id: hotTopicId,
      overrideAccess: true,
      data: { status: 'in_lavorazione' } as never,
    })
  } catch {
    /* non bloccante */
  }

  return { ok: true, dati: { ...esito.dati, modello: conf.textModel } }
}

/* -------------------------------------------------------------------------- */
/* Dalla proposta alla bozza — RF-AI-08                                       */
/* -------------------------------------------------------------------------- */

export async function portaInBozza(input: {
  proposta: Proposta
  categoriaId?: string | null
  hotTopicId?: string | null
  brief?: string | null
}): Promise<Esito<{ urlModifica: string }>> {
  const sessione = await redattoreCorrente()
  if (!sessione.ok) return sessione

  const payload = await getPayload({ config })

  try {
    const esito = await creaBozzaDaProposta({
      payload,
      utenteId: sessione.utente.id,
      proposta: input.proposta,
      categoriaId: input.categoriaId ?? null,
      hotTopicId: input.hotTopicId ?? null,
      brief: input.brief ?? null,
      modello: input.proposta.modello,
    })

    if (!esito.ok) return esito

    revalidatePath('/admin/hot-topic')
    return { ok: true, dati: { urlModifica: esito.dati.urlModifica } }
  } catch (err) {
    return { ok: false, messaggio: `Creazione della bozza fallita: ${(err as Error).message}` }
  }
}

/* -------------------------------------------------------------------------- */
/* Scarto di un argomento — RF-AI-03 (taratura della rilevanza)               */
/* -------------------------------------------------------------------------- */

export async function scartaHotTopic(id: string, motivo: string): Promise<Esito<null>> {
  const sessione = await redattoreCorrente()
  if (!sessione.ok) return sessione

  const payload = await getPayload({ config })

  try {
    await payload.update({
      collection: 'hot-topics',
      id,
      overrideAccess: true,
      // Il motivo non è burocrazia: se scartiamo sempre lo stesso genere di
      // argomenti, è la configurazione della rilevanza che va corretta.
      data: { status: 'scartato', discardReason: motivo || null } as never,
    })
    revalidatePath('/admin/hot-topic')
    return { ok: true, dati: null }
  } catch (err) {
    return { ok: false, messaggio: (err as Error).message }
  }
}
