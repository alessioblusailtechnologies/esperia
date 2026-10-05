import type { LexicalEditor } from '@payloadcms/richtext-lexical/lexical'

/**
 * Collegamento fra il corpo dell'articolo e il pannello "Assistente AI" — RF-AI-06.
 *
 * Il pannello sta nella colonna laterale, fuori dall'albero React dell'editor
 * Lexical, e non puo' raggiungerlo con un contesto. Il plugin montato
 * nell'editor (PonteEditorFeature) registra qui l'istanza e la selezione
 * corrente; il pannello le legge da qui. Una pagina di modifica ha un solo
 * corpo d'articolo, quindi un solo editor alla volta.
 */

export interface PuntoSelezione {
  key: string
  offset: number
  type: 'text' | 'element'
}

export interface SelezioneSalvata {
  testo: string
  anchor: PuntoSelezione
  focus: PuntoSelezione
}

let editorCorrente: LexicalEditor | null = null
let selezioneCorrente: SelezioneSalvata | null = null
const ascoltatori = new Set<() => void>()

function avvisa() {
  for (const a of ascoltatori) a()
}

export function registraEditor(editor: LexicalEditor | null) {
  editorCorrente = editor
  if (!editor) selezioneCorrente = null
  avvisa()
}

export function aggiornaSelezione(selezione: SelezioneSalvata | null) {
  // Il clic su un pulsante del pannello toglie il focus all'editor: la selezione
  // viene conservata finche' il redattore non ne fa un'altra dentro il corpo.
  const prima = selezioneCorrente?.testo ?? ''
  selezioneCorrente = selezione
  if ((selezione?.testo ?? '') !== prima) avvisa()
}

export function ottieniEditor(): LexicalEditor | null {
  return editorCorrente
}

export function ottieniSelezione(): SelezioneSalvata | null {
  return selezioneCorrente
}

export function abbonati(ascoltatore: () => void): () => void {
  ascoltatori.add(ascoltatore)
  return () => {
    ascoltatori.delete(ascoltatore)
  }
}
