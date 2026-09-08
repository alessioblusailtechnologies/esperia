import type { StatoVisibile } from '@esperia/shared'
import { STATO_VISIBILE_LABEL } from '@esperia/shared'

import './PastigliaStato.scss'

/**
 * Pastiglia dello stato editoriale — dai design (Pastiglia Stato v1).
 *
 * Componente presentazionale puro, riusato in elenco articoli, dashboard ed
 * editor: lo stato deve avere lo stesso aspetto ovunque, altrimenti la
 * redazione impara cinque codici colore invece di uno.
 */
export function PastigliaStato({ stato }: { stato: StatoVisibile }) {
  return (
    <span className={`pastiglia pastiglia--${stato}`}>
      <span className="pastiglia__punto" aria-hidden="true" />
      {STATO_VISIBILE_LABEL[stato]}
    </span>
  )
}

export default PastigliaStato
