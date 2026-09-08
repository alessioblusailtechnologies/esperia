import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

/**
 * Cifratura simmetrica per i segreti custoditi in database (chiavi API dei
 * provider AI — RF-AI-09).
 *
 * La chiave deriva da PAYLOAD_SECRET: ruotarlo rende illeggibili i segreti
 * gia' salvati, che vanno reinseriti da backoffice. E' un compromesso
 * accettabile perche' sono pochi valori e li conosce il Committente.
 */

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const SALT = 'esperia.secrets.v1'

let cachedKey: Buffer | null = null

function key(): Buffer {
  if (cachedKey) return cachedKey
  const secret = process.env.PAYLOAD_SECRET
  if (!secret) throw new Error('PAYLOAD_SECRET non impostato: impossibile cifrare i segreti.')
  cachedKey = scryptSync(secret, SALT, 32)
  return cachedKey
}

/** Restituisce `v1.<iv>.<tag>.<ciphertext>`, tutto in base64url. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), enc.toString('base64url')].join(
    '.',
  )
}

export function decryptSecret(stored: string): string {
  const parts = stored.split('.')
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Formato del segreto cifrato non riconosciuto.')
  }
  const [, ivB64, tagB64, dataB64] = parts as [string, string, string, string]
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivB64, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('v1.') && value.split('.').length === 4
}

/** Decifra senza sollevare: usato dove una chiave assente deve solo disattivare una feature (RNF-10). */
export function tryDecryptSecret(stored: unknown): string | null {
  if (typeof stored !== 'string' || !isEncrypted(stored)) return null
  try {
    return decryptSecret(stored)
  } catch {
    return null
  }
}
