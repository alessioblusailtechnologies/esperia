import {
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $isElementNode,
  $isParagraphNode,
  $setSelection,
  type ElementNode,
  type LexicalNode,
  type ParagraphNode,
} from '@payloadcms/richtext-lexical/lexical'
import { $isHeadingNode, $isQuoteNode } from '@payloadcms/richtext-lexical/lexical/rich-text'

import type { BloccoCorpo, ModificaCorpo } from '@/lib/ai/assistenza'
import { ottieniEditor, type SelezioneSalvata } from './ponteEditor'

/**
 * Letture e scritture sul corpo dell'articolo per la barra dell'assistente
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

/* -------------------------------------------------------------------------- */
/* Istruzione libera: il corpo a blocchi numerati                             */
/* -------------------------------------------------------------------------- */

/** Un blocco inviato all'assistente, con quel che serve per ritrovarlo. */
export interface BloccoInviato extends BloccoCorpo {
  chiave: string
}

/** Solo il testo semplice si riscrive: elenchi, immagini e blocchi restano com'erano. */
function tipoBlocco(nodo: LexicalNode): { tipo: string; modificabile: boolean } {
  if ($isParagraphNode(nodo)) return { tipo: 'paragrafo', modificabile: true }
  if ($isHeadingNode(nodo)) return { tipo: 'titoletto', modificabile: true }
  if ($isQuoteNode(nodo)) return { tipo: 'citazione', modificabile: true }
  if (nodo.getType() === 'list') return { tipo: 'elenco', modificabile: false }
  if (nodo.getType() === 'upload') return { tipo: 'immagine', modificabile: false }
  return { tipo: nodo.getType(), modificabile: false }
}

/** Il corpo come lo vede l'assistente: i blocchi non vuoti, numerati da 1. */
export function blocchiCorpo(): BloccoInviato[] {
  const editor = ottieniEditor()
  if (!editor) return []
  return editor.getEditorState().read(() => {
    const blocchi: BloccoInviato[] = []
    for (const nodo of $getRoot().getChildren()) {
      const testo = nodo.getTextContent()
      const { tipo, modificabile } = tipoBlocco(nodo)
      if (!testo.trim() && modificabile) continue
      blocchi.push({
        n: blocchi.length + 1,
        chiave: nodo.getKey(),
        tipo,
        modificabile,
        testo: testo.trim() ? testo : '(senza testo)',
      })
    }
    return blocchi
  })
}

/** Un capoverso per paragrafo: il modello separa i paragrafi con una riga vuota. */
function capoversi(testo: string): string[] {
  return testo
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

function paragrafi(testi: string[]): ParagraphNode[] {
  return testi.map((p) => $createParagraphNode().append($createTextNode(p)))
}

/**
 * Applica una modifica proposta dall'istruzione libera. Come per la
 * riscrittura, solo se il blocco è ancora quello che l'assistente ha letto.
 * La formattazione interna del blocco sostituito (grassetti, link) si perde:
 * il modello restituisce testo semplice.
 */
export function applicaModifica(
  modifica: ModificaCorpo,
  blocchi: BloccoInviato[],
  selezione: SelezioneSalvata | null,
): boolean {
  if (modifica.blocco === 0 && modifica.azione === 'sostituisci') {
    return selezione ? applicaAlCorpo({ tipo: 'selezione', selezione }, modifica.testo) : false
  }

  const editor = ottieniEditor()
  if (!editor) return false

  let riuscito = false
  editor.update(
    () => {
      if (modifica.blocco === 0) {
        // «inserisci_dopo» il blocco 0: in testa al corpo.
        const nuovi = paragrafi(capoversi(modifica.testo))
        if (!nuovi.length) return
        const primo = $getRoot().getFirstChild()
        for (const p of nuovi) {
          if (primo) primo.insertBefore(p)
          else $getRoot().append(p)
        }
        riuscito = true
        return
      }

      const blocco = blocchi.find((b) => b.n === modifica.blocco)
      if (!blocco?.modificabile) return
      const nodo = $getNodeByKey(blocco.chiave)
      if (!nodo || !$isElementNode(nodo) || nodo.getTextContent() !== blocco.testo) return

      if (modifica.azione === 'elimina') {
        nodo.remove()
      } else if (modifica.azione === 'inserisci_dopo') {
        const nuovi = paragrafi(capoversi(modifica.testo))
        if (!nuovi.length) return
        let dopo: LexicalNode = nodo
        for (const p of nuovi) {
          dopo.insertAfter(p)
          dopo = p
        }
      } else {
        const [primo, ...resto] = capoversi(modifica.testo)
        if (!primo) return
        const elemento = nodo as ElementNode
        elemento.clear()
        elemento.append($createTextNode(primo))
        // Un titoletto resta un titoletto; i capoversi in più diventano paragrafi.
        let dopo: LexicalNode = elemento
        for (const p of paragrafi(resto)) {
          dopo.insertAfter(p)
          dopo = p
        }
      }
      riuscito = true
    },
    { discrete: true },
  )
  return riuscito
}
