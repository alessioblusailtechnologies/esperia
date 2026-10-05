'use client'

import { Icona } from '@/components/Icona'
import { apriNuovoArticolo } from '@/components/nav/costanti'

/**
 * «Nuovo articolo» nella barra in alto dell'elenco articoli, come le azioni
 * di pagina in Moonbrand Studio. Apre la stessa finestra della navigazione:
 * foglio bianco, appunti o hot topic.
 */
export function AzioneNuovoArticolo() {
  return (
    <button type="button" className="azione-pagina" onClick={() => apriNuovoArticolo()}>
      <Icona nome="piu" dimensione={16} tratto={2.2} />
      Nuovo articolo
    </button>
  )
}

export default AzioneNuovoArticolo
