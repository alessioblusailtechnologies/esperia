'use client'

import { statoVisibile } from '@esperia/shared'

import { PastigliaStato } from './PastigliaStato'

/**
 * Colonna "Stato" nell'elenco articoli — dai design (Articoli v1).
 *
 * Sostituisce la cella predefinita, che mostrerebbe il solo `editorialStatus`
 * come testo grezzo. La redazione ha bisogno di leggere in un colpo d'occhio
 * anche se un pezzo è già online o programmato: informazione che vive su altri
 * campi e che `statoVisibile` (packages/shared) fonde in un valore solo.
 */
export function CellaStato({ rowData }: { rowData?: Record<string, unknown> }) {
  return <PastigliaStato stato={statoVisibile(rowData ?? {})} />
}

export default CellaStato
