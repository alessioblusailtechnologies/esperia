import { createHmac, timingSafeEqual } from 'node:crypto'
import type { AstroCookies } from 'astro'

/**
 * Anteprima delle bozze — RF-B-04.
 *
 * Il CMS apre /api/preview con il segreto condiviso; da lì il portale imposta
 * un cookie che autorizza a mostrare le bozze. Il cookie è FIRMATO con lo
 * stesso segreto: un valore fisso («1») si potrebbe scrivere a mano nel
 * browser, e chiunque vedrebbe gli articoli non pubblicati.
 *
 * Formato: `<scadenza in ms>.<hmac>`. Vale un'ora, il tempo di una revisione.
 */

export const COOKIE_ANTEPRIMA = 'esperia-anteprima'
const DURATA_MS = 60 * 60 * 1000

function segreto(): string | null {
  return import.meta.env.PORTAL_REVALIDATE_SECRET || null
}

function firma(scadenza: number, chiave: string): string {
  return createHmac('sha256', chiave).update(`anteprima:${scadenza}`).digest('base64url')
}

/** Il valore del cookie da impostare, o null se il segreto non è configurato. */
export function creaValoreAnteprima(): { valore: string; maxAge: number } | null {
  const chiave = segreto()
  if (!chiave) return null
  const scadenza = Date.now() + DURATA_MS
  return { valore: `${scadenza}.${firma(scadenza, chiave)}`, maxAge: DURATA_MS / 1000 }
}

/** Vero solo se il cookie c'è, è firmato con il nostro segreto e non è scaduto. */
export function anteprimaValida(cookies: AstroCookies): boolean {
  const chiave = segreto()
  const valore = cookies.get(COOKIE_ANTEPRIMA)?.value
  if (!chiave || !valore) return false

  const [testoScadenza, firmaRicevuta] = valore.split('.')
  const scadenza = Number(testoScadenza)
  if (!Number.isFinite(scadenza) || scadenza < Date.now() || !firmaRicevuta) return false

  const attesa = Buffer.from(firma(scadenza, chiave))
  const ricevuta = Buffer.from(firmaRicevuta)
  return attesa.length === ricevuta.length && timingSafeEqual(attesa, ricevuta)
}

/** Origine del backoffice: l'unica autorizzata a incorniciare l'anteprima e a inviarle messaggi. */
export function origineCms(): string {
  return new URL(import.meta.env.PAYLOAD_URL ?? 'http://localhost:3001').origin
}
