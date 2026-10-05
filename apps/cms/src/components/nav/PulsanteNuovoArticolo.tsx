'use client'

import type { ReactNode } from 'react'

import { apriNuovoArticolo, type DettaglioNuovoArticolo } from './costanti'

/** Apre la finestra «Nuovo articolo» da una vista server (es. la Scrivania). */
export function PulsanteNuovoArticolo({
  className,
  dettaglio,
  children,
}: {
  className?: string
  dettaglio?: DettaglioNuovoArticolo
  children: ReactNode
}) {
  return (
    <button type="button" className={className} onClick={() => apriNuovoArticolo(dettaglio)}>
      {children}
    </button>
  )
}

export default PulsanteNuovoArticolo
