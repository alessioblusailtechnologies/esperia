'use client'

import { useEffect } from 'react'
import { createClientFeature } from '@payloadcms/richtext-lexical/client'
import { useLexicalComposerContext } from '@payloadcms/richtext-lexical/lexical/react/LexicalComposerContext'
import { $getSelection, $isRangeSelection } from '@payloadcms/richtext-lexical/lexical'

import { aggiornaSelezione, registraEditor } from './ponteEditor'

/**
 * Plugin invisibile montato nel corpo dell'articolo: espone editor e selezione
 * al pannello dell'assistente (vedi ponteEditor.ts). Non disegna nulla e non
 * modifica nulla da solo.
 */
function PluginPonte() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    registraEditor(editor)

    const smetti = editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selezione = $getSelection()
        if (!$isRangeSelection(selezione)) return
        // Selezione vuota (solo il cursore): resta valida l'ultima non vuota fino
        // al prossimo clic nel corpo, che la azzera qui sotto.
        if (selezione.isCollapsed()) {
          if (editor.getRootElement()?.contains(document.activeElement)) aggiornaSelezione(null)
          return
        }
        aggiornaSelezione({
          testo: selezione.getTextContent(),
          anchor: { ...selezione.anchor },
          focus: { ...selezione.focus },
        })
      })
    })

    return () => {
      smetti()
      registraEditor(null)
    }
  }, [editor])

  return null
}

export const PonteEditorFeatureClient = createClientFeature({
  plugins: [{ Component: PluginPonte, position: 'normal' }],
})
