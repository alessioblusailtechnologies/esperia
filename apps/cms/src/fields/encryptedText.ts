import type { Field } from 'payload'
import { encryptSecret, isEncrypted, tryDecryptSecret } from '@/lib/crypto'
import { isAdminField } from '@/access'

/** Valore restituito all'interfaccia al posto del segreto in chiaro. */
export const SECRET_MASK = '••••••••'

/**
 * Campo testo il cui contenuto viene cifrato a riposo e mai restituito in
 * chiaro dalle API — RF-AI-09.
 *
 * In admin l'utente vede una maschera con le ultime 4 cifre; risalvando il
 * documento senza toccare il campo, la maschera viene riconosciuta e il valore
 * precedente resta intatto.
 */
export function encryptedText(overrides: {
  name: string
  label: string
  description?: string
}): Field {
  return {
    name: overrides.name,
    type: 'text',
    label: overrides.label,
    access: {
      read: isAdminField,
      create: isAdminField,
      update: isAdminField,
    },
    admin: {
      description:
        overrides.description ??
        'La chiave viene cifrata prima del salvataggio. Lasciare la maschera invariata per non modificarla.',
      autoComplete: 'off',
    },
    hooks: {
      beforeChange: [
        ({ value, previousValue }) => {
          if (value === null || value === undefined || value === '') return null
          if (typeof value !== 'string') return previousValue ?? null

          const incoming: string = value

          // L'utente non ha toccato il campo: l'interfaccia ha rimandato indietro la maschera.
          if (incoming.startsWith(SECRET_MASK)) return previousValue ?? null

          // Idempotenza: un valore gia' cifrato non va cifrato due volte.
          if (isEncrypted(incoming)) return incoming

          return encryptSecret(incoming.trim())
        },
      ],
      afterRead: [
        ({ value }) => {
          const plain = tryDecryptSecret(value)
          if (!plain) return value ? SECRET_MASK : null
          return `${SECRET_MASK}${plain.slice(-4)}`
        },
      ],
    },
  }
}
