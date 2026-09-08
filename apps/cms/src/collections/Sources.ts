import type { CollectionConfig } from 'payload'
import { isAdmin, isEditor } from '@/access'
import { encryptedText } from '@/fields/encryptedText'

/**
 * Fonti news e trend da monitorare — RF-AI-01.
 *
 * Deliberatamente generiche: il tipo di fonte determina l'adattatore usato
 * dal job di ingestione, cosi' aggiungere un provider non richiede modifiche
 * allo schema. La scelta puntuale dei provider e' rinviata al kick-off e i
 * costi sono a carico del Committente (V-02).
 */
export const Sources: CollectionConfig = {
  slug: 'sources',
  labels: { singular: 'Fonte', plural: 'Fonti news e trend' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'type', 'enabled', 'lastFetchedAt', 'lastStatus'],
    group: 'Intelligenza artificiale',
    description:
      'Fonti interrogate periodicamente per individuare gli hot topic. I costi delle API sono a carico del Committente.',
  },
  access: {
    read: isEditor,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    { name: 'name', type: 'text', required: true, label: 'Nome' },
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'rss',
      label: 'Tipo di fonte',
      options: [
        { value: 'rss', label: 'Feed RSS / Atom (gratuito)' },
        { value: 'newsapi', label: 'NewsAPI (a consumo)' },
        { value: 'gdelt', label: 'GDELT (gratuito, alto volume)' },
        { value: 'google_trends', label: 'Google Trends via SerpAPI (a consumo)' },
        { value: 'custom_http', label: 'Endpoint HTTP JSON personalizzato' },
      ],
    },
    {
      name: 'endpoint',
      type: 'text',
      required: true,
      label: 'URL / endpoint',
      admin: { description: 'Per i feed RSS, l indirizzo del feed. Per le API, l URL base.' },
    },
    {
      name: 'query',
      type: 'text',
      label: 'Query o parametri',
      admin: {
        description:
          'Parole chiave o filtri passati alla fonte, se il provider li supporta. Es. "Taranto OR Puglia".',
      },
    },
    encryptedText({
      name: 'apiKey',
      label: 'Chiave API della fonte',
      description:
        'Opzionale: usare solo se questa fonte ha una chiave dedicata. Viene cifrata prima del salvataggio.',
    }),
    {
      name: 'enabled',
      type: 'checkbox',
      defaultValue: true,
      label: 'Attiva',
      admin: { position: 'sidebar' },
    },
    {
      name: 'pollIntervalMinutes',
      type: 'number',
      defaultValue: 60,
      min: 5,
      label: 'Frequenza di interrogazione (minuti)',
      admin: {
        position: 'sidebar',
        description: 'Abbassarla aumenta i costi a consumo sulle fonti a pagamento.',
      },
    },
    {
      name: 'weight',
      type: 'number',
      defaultValue: 1,
      min: 0,
      max: 5,
      label: 'Peso nel ranking',
      admin: {
        position: 'sidebar',
        description:
          'Moltiplicatore applicato agli argomenti che arrivano da questa fonte (RF-AI-03). 1 = neutro.',
      },
    },

    /* Diagnostica, scritta dal job — sola lettura in interfaccia. */
    {
      name: 'lastFetchedAt',
      type: 'date',
      label: 'Ultima interrogazione',
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'lastStatus',
      type: 'select',
      label: 'Esito ultima interrogazione',
      options: [
        { value: 'ok', label: 'OK' },
        { value: 'errore', label: 'Errore' },
      ],
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'lastError',
      type: 'textarea',
      label: 'Dettaglio errore',
      admin: { readOnly: true, condition: (data) => data?.lastStatus === 'errore' },
    },
  ],
}
