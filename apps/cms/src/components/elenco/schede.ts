/**
 * Le schede dell'elenco articoli e il filtro che ognuna applica. Il filtro
 * finisce nell'indirizzo come `where[campo][equals]=valore`, la forma che
 * l'elenco di Payload legge da sé.
 */
export interface Scheda {
  chiave: string
  etichetta: string
  campo?: 'editorialStatus' | '_status'
  valore?: string
  where?: Record<string, { equals: string }>
}

const scheda = (
  chiave: string,
  etichetta: string,
  campo?: Scheda['campo'],
  valore?: string,
): Scheda => ({
  chiave,
  etichetta,
  campo,
  valore,
  where: campo && valore ? { [campo]: { equals: valore } } : undefined,
})

export const SCHEDE: Scheda[] = [
  scheda('tutti', 'Tutti'),
  scheda('revisione', 'Da rivedere', 'editorialStatus', 'in_revisione'),
  scheda('bozze', 'Bozze', 'editorialStatus', 'bozza'),
  scheda('approvati', 'Approvati', 'editorialStatus', 'approvato'),
  scheda('pubblicati', 'Pubblicati', '_status', 'published'),
]
