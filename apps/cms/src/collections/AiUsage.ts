import type { CollectionConfig } from 'payload'
import { AI_OPERATIONS } from '@esperia/shared'
import { isEditor } from '@/access'

/**
 * Registro dei consumi verso i provider AI — RF-AI-10.
 *
 * I costi delle API sono a carico del Committente (V-02): senza un registro
 * interno l'unico modo di controllarli sarebbe la fattura del provider, che
 * arriva a mese chiuso e non dice chi ha speso cosa.
 *
 * Sola lettura per tutti: e' un log, non un contenuto. Lo scrivono i servizi AI.
 */
export const AiUsage: CollectionConfig = {
  slug: 'ai-usage',
  labels: { singular: 'Consumo AI', plural: 'Consumi AI' },
  admin: {
    useAsTitle: 'operation',
    defaultColumns: ['createdAt', 'operation', 'model', 'totalTokens', 'estimatedCostEur', 'user'],
    group: 'Intelligenza artificiale',
    description:
      'Chiamate effettuate ai provider esterni. I costi sono fatturati direttamente al Committente.',
  },
  access: {
    read: isEditor,
    create: () => false, // solo scritture di sistema, con overrideAccess
    update: () => false,
    delete: () => false,
  },
  defaultSort: '-createdAt',
  timestamps: true,
  fields: [
    {
      name: 'provider',
      type: 'text',
      required: true,
      label: 'Provider',
      admin: { readOnly: true },
    },
    { name: 'model', type: 'text', required: true, label: 'Modello', admin: { readOnly: true } },
    {
      name: 'operation',
      type: 'select',
      required: true,
      label: 'Operazione',
      options: AI_OPERATIONS.map((value) => ({ value, label: value.replace(/_/g, ' ') })),
      admin: { readOnly: true },
    },
    { name: 'inputTokens', type: 'number', defaultValue: 0, admin: { readOnly: true } },
    { name: 'outputTokens', type: 'number', defaultValue: 0, admin: { readOnly: true } },
    {
      name: 'totalTokens',
      type: 'number',
      defaultValue: 0,
      label: 'Token totali',
      admin: { readOnly: true },
    },
    {
      name: 'estimatedCostEur',
      type: 'number',
      label: 'Costo stimato (EUR)',
      admin: {
        readOnly: true,
        description:
          'Stima calcolata sul listino configurato in Impostazioni AI. Fa fede la fattura del provider.',
      },
    },
    {
      name: 'durationMs',
      type: 'number',
      label: 'Durata (ms)',
      admin: { readOnly: true },
    },
    {
      name: 'success',
      type: 'checkbox',
      defaultValue: true,
      label: 'Riuscita',
      admin: { readOnly: true },
    },
    {
      name: 'errorMessage',
      type: 'text',
      label: 'Errore',
      admin: { readOnly: true, condition: (data) => data?.success === false },
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      label: 'Richiesto da',
      admin: { readOnly: true, description: 'Vuoto se la chiamata proviene da un job automatico.' },
    },
    {
      name: 'article',
      type: 'relationship',
      relationTo: 'articles',
      label: 'Articolo',
      admin: { readOnly: true },
    },
  ],
}
