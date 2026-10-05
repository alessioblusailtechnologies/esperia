import {
  $createRangeSelection,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $isParagraphNode,
  $setSelection,
  type ParagraphNode,
} from '@payloadcms/richtext-lexical/lexical'

import { ottieniEditor, type SelezioneSalvata } from './ponteEditor'

/**
 * Letture e scritture sul corpo dell'articolo per il pannello dell'assistente
 * (RF-AI-06). Separate dal componente perche' sono la parte che puo' fare
 * danni: si provano su un editor Lexical senza interfaccia.
 */

/** Il passaggio su cui lavorano riscrittura e sintesi, fissato al momento della richiesta. */
export type Bersaglio =
  | { tipo: 'selezione'; selezione: SelezioneSalvata }
  | { tipo: 'paragrafo'; chiave: string; testo: string }

export function primoParagrafo(): { chiave: string; testo: string } | null {
  const editor = ottieniEditor()
  if (!editor) return null
  return editor.getEditorState().read(() => {
    for (const nodo of $getRoot().getChildren()) {
      if ($isParagraphNode(nodo) && nodo.getTextContent().trim()) {
        return { chiave: nodo.getKey(), testo: nodo.getTextContent() }
      }
    }
    return null
  })
}

export function testoArticolo(): string {
  const editor = ottieniEditor()
  if (!editor) return ''
  return editor.getEditorState().read(() => $getRoot().getTextContent())
}

/**
 * Sostituisce il passaggio con la proposta, solo se e' ancora quello che
 * l'assistente ha letto: se nel frattempo il redattore l'ha modificato,
 * sovrascriverlo cancellerebbe il suo lavoro.
 */
export function applicaAlCorpo(bersaglio: Bersaglio, testo: string): boolean {
  const editor = ottieniEditor()
  if (!editor) return false

  let riuscito = false
  editor.update(
    () => {
      if (bersaglio.tipo === 'paragrafo') {
        const nodo = $getNodeByKey(bersaglio.chiave)
        if (!nodo || !$isParagraphNode(nodo) || nodo.getTextContent() !== bersaglio.testo) return
        const paragrafo = nodo as ParagraphNode
        paragrafo.clear()
        paragrafo.append($createTextNode(testo))
        riuscito = true
        return
      }

      const { anchor, focus, testo: originale } = bersaglio.selezione
      if (!$getNodeByKey(anchor.key) || !$getNodeByKey(focus.key)) return
      const selezione = $createRangeSelection()
      selezione.anchor.set(anchor.key, anchor.offset, anchor.type)
      selezione.focus.set(focus.key, focus.offset, focus.type)
      if (selezione.getTextContent() !== originale) return
      $setSelection(selezione)
      selezione.insertText(testo)
      riuscito = true
    },
    { discrete: true },
  )
  return riuscito
}
