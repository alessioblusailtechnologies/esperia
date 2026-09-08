import type { CollectionConfig } from 'payload'
import { HOT_TOPIC_STATUSES } from '@esperia/shared'
import { authenticated, isEditor } from '@/access'

const STATUS_LABELS: Record<string, string> = {
  nuovo: 'Nuovo',
  in_lavorazione: 'In lavorazione',
  convertito: 'Convertito in articolo',
  scartato: 'Scartato',
}

/**
 * Hot topic proposti dal modulo AI — RF-AI-02.
 *
 * Un hot topic e' un CLUSTER di notizie, non una singola notizia: piu' fonti
 * che parlano dello stesso fatto vengono aggregate, cosi' la redazione vede
 * "cosa sta succedendo" e non un elenco di titoli duplicati.
 *
 * Nessun hot topic diventa contenuto pubblico da solo: e' materiale di lavoro
 * per la redazione, che decide se e come trasformarlo in articolo (RF-AI-08).
 */
export const HotTopics: CollectionConfig = {
  slug: 'hot-topics',
  labels: { singular: 'Hot topic', plural: 'Hot topic' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'score', 'status', 'detectedAt'],
    group: 'Intelligenza artificiale',
    description:
      'Argomenti emergenti individuati automaticamente dalle fonti configurate. Ordinati per rilevanza.',
  },
  access: {
    read: authenticated,
    // Li crea il job di ingestione (che gira con overrideAccess), non una persona.
    create: isEditor,
    update: authenticated,
    delete: isEditor,
  },
  defaultSort: '-score',
  fields: [
    { name: 'title', type: 'text', required: true, label: 'Argomento' },
    {
      name: 'summary',
      type: 'textarea',
      label: 'Sintesi',
      admin: { description: 'Riassunto generato a partire dalle fonti del cluster.' },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'nuovo',
      label: 'Stato',
      options: HOT_TOPIC_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] ?? value })),
      admin: { position: 'sidebar' },
    },
    {
      name: 'score',
      type: 'number',
      required: true,
      defaultValue: 0,
      label: 'Rilevanza',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Volume x freschezza x affinita con la linea editoriale (RF-AI-03).',
      },
    },
    {
      name: 'detectedAt',
      type: 'date',
      required: true,
      label: 'Individuato il',
      index: true,
      admin: { position: 'sidebar', readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'suggestedCategory',
      type: 'relationship',
      relationTo: 'categories',
      label: 'Categoria suggerita',
      admin: { position: 'sidebar' },
    },
    {
      name: 'keywords',
      type: 'text',
      hasMany: true,
      label: 'Parole chiave',
    },
    {
      // Le fonti restano visibili accanto alla proposta: la redazione deve poter
      // risalire all'originale prima di scriverci sopra. RF-AI-02.
      name: 'references',
      type: 'array',
      label: 'Fonti del cluster',
      admin: { description: 'Notizie che hanno concorso a formare questo argomento.' },
      fields: [
        { name: 'title', type: 'text', required: true, label: 'Titolo' },
        { name: 'url', type: 'text', required: true, label: 'URL' },
        { name: 'publisher', type: 'text', label: 'Testata' },
        { name: 'publishedAt', type: 'date', label: 'Data' },
        {
          name: 'source',
          type: 'relationship',
          relationTo: 'sources',
          label: 'Fonte configurata',
        },
      ],
    },
    {
      name: 'generatedArticle',
      type: 'relationship',
      relationTo: 'articles',
      label: 'Articolo generato',
      admin: {
        readOnly: true,
        description: 'Valorizzato quando un redattore trasforma l argomento in bozza (RF-AI-04).',
      },
    },
    {
      name: 'discardReason',
      type: 'text',
      label: 'Motivo dello scarto',
      admin: {
        condition: (data) => data?.status === 'scartato',
        description:
          'Utile per tarare i parametri di rilevanza: se scartiamo sempre lo stesso genere di argomenti, la configurazione va corretta.',
      },
    },
    {
      // Impronta del cluster: serve al job per riconoscere lo stesso argomento
      // in esecuzioni successive invece di duplicarlo ogni ora.
      name: 'clusterKey',
      type: 'text',
      index: true,
      unique: true,
      admin: { hidden: true },
    },
  ],
}
