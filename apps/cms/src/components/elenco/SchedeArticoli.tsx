import { getPayload, type Payload, type Where } from 'payload'

import config from '@/payload.config'
import { SCHEDE } from './schede'
import { SchedeArticoliClient } from './SchedeArticoliClient'

/**
 * Schede per stato sopra l'elenco articoli: Tutti, Da rivedere, Bozze,
 * Approvati, Pubblicati, ciascuna col suo conteggio.
 *
 * I conteggi si leggono qui, sul server, a ogni caricamento dell'elenco; la
 * scheda attiva la decide la parte client dall'indirizzo, perché è lì che
 * Payload tiene il filtro (`?where=…`).
 */
export async function SchedeArticoli({ payload: daProps }: { payload?: Payload }) {
  const payload = daProps ?? (await getPayload({ config }))

  const conteggi = await Promise.all(
    SCHEDE.map(async (s) => {
      try {
        const r = await payload.count({
          collection: 'articles',
          where: (s.where ?? {}) as Where,
          overrideAccess: true,
        })
        return r.totalDocs
      } catch {
        return null
      }
    }),
  )

  return <SchedeArticoliClient conteggi={conteggi} />
}

export default SchedeArticoli
