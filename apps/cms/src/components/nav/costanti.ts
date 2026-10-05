/** Cookie della barra compressa: letto dal server per non far saltare la colonna al caricamento. */
export const COOKIE_NAV_COMPATTA = 'esperia-nav-compatta'

/** Gruppi della barra che la persona ha aperto o chiuso, in questo browser. */
export const CHIAVE_GRUPPI_CHIUSI = 'esperia.gruppi-nav'

/** Evento con cui qualunque schermata apre la finestra «Nuovo articolo». */
export const EVENTO_NUOVO_ARTICOLO = 'esperia:nuovo-articolo'

export interface DettaglioNuovoArticolo {
  passo?: 'scelta' | 'appunti' | 'argomento'
  hotTopicId?: string
}

/** Apre «Nuovo articolo» da qualunque punto del backoffice (es. dagli hot topic). */
export function apriNuovoArticolo(dettaglio: DettaglioNuovoArticolo = {}) {
  window.dispatchEvent(new CustomEvent(EVENTO_NUOVO_ARTICOLO, { detail: dettaglio }))
}
