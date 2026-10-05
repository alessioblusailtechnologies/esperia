import { createServerFeature } from '@payloadcms/richtext-lexical'

/**
 * Lato server della feature che collega il corpo dell'articolo alla barra
 * "Assistente AI" (RF-AI-06). Non aggiunge nodi ne' trasformazioni: serve solo
 * a montare il plugin client nell'editor.
 */
export const PonteAssistenteFeature = createServerFeature({
  feature: {
    ClientFeature: '@/components/assistente/PonteEditorFeature#PonteEditorFeatureClient',
  },
  key: 'ponteAssistente',
})
