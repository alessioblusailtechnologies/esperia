import type { CollectionConfig } from 'payload'
import {
  lexicalEditor,
  HeadingFeature,
  BlocksFeature,
  FixedToolbarFeature,
  HorizontalRuleFeature,
  UploadFeature,
} from '@payloadcms/richtext-lexical'
import {
  AI_ORIGINS,
  EDITORIAL_STATUSES,
  EDITORIAL_STATUS_LABELS,
  type EditorialStatus,
} from '@esperia/shared'
import {
  canCreateArticle,
  canDeleteArticle,
  canUpdateArticle,
  isEditorField,
  publishedOrStaff,
} from '@/access'
import { slugField } from '@/fields/slug'
import { seoField } from '@/fields/seo'
import { enforceWorkflow } from '@/hooks/enforceWorkflow'
import { revalidateArticle, revalidateArticleOnDelete } from '@/hooks/revalidatePortal'
import { auditChange, auditDelete } from '@/hooks/auditLog'
import { indicizzaArticolo, rimuoviDaIndice } from '@/hooks/searchIndex'
import { estimateReadingMinutes, lexicalToPlainText } from '@/lib/lexical'

const previewUrl = (slug: unknown): string => {
  const base = process.env.PORTAL_URL ?? 'http://localhost:4321'
  const secret = process.env.PORTAL_REVALIDATE_SECRET ?? ''
  return `${base}/api/preview?slug=${String(slug ?? '')}&secret=${secret}`
}

/**
 * Articoli — cuore della piattaforma.
 * Copre RF-P-04, RF-B-03/04/05/06/09/13, RF-AI-08 e RF-AI-11.
 */
export const Articles: CollectionConfig = {
  slug: 'articles',
  labels: { singular: 'Articolo', plural: 'Articoli' },

  admin: {
    useAsTitle: 'title',
    // Colonne dai design (Articoli v1). Niente _status: la pastiglia di
    // editorialStatus lo incorpora gia (vedi statoVisibile), e due colonne
    // di stato affiancate si contraddicono a colpo docchio.
    defaultColumns: ['title', 'authors', 'category', 'editorialStatus', 'publishedAt', 'updatedAt'],
    group: 'Contenuti',
    // Anteprima dell'articolo come apparira' sul portale — RF-B-04.
    preview: (doc) => previewUrl(doc?.slug),
    livePreview: {
      url: ({ data }) => previewUrl(data?.slug),
      breakpoints: [
        { label: 'Mobile', name: 'mobile', width: 390, height: 844 },
        { label: 'Tablet', name: 'tablet', width: 834, height: 1112 },
        { label: 'Desktop', name: 'desktop', width: 1440, height: 900 },
      ],
    },
  },

  access: {
    read: publishedOrStaff,
    create: canCreateArticle,
    update: canUpdateArticle,
    delete: canDeleteArticle,
  },

  // RF-B-13 (storico versioni) e RF-B-06 (pubblicazione programmata).
  versions: {
    maxPerDoc: 25,
    drafts: {
      autosave: { interval: 2000 },
      schedulePublish: true,
    },
  },

  hooks: {
    beforeChange: [
      enforceWorkflow,
      ({ data }) => {
        // Campi derivati: si ricalcolano a ogni salvataggio e non sono
        // modificabili a mano.
        const plain = lexicalToPlainText(data.content)

        /*
         * Due campi distinti, non uno solo, perché servono a cose diverse:
         * `searchText` alimenta il vettore di ricerca (dove titolo e sommario
         * devono pesare di più), `bodyText` alimenta il frammento mostrato nei
         * risultati — che deve venire dal CORPO, altrimenti l'anteprima ripete
         * il titolo che l'utente ha già letto una riga sopra.
         */
        data.searchText = [data.title, data.kicker, data.subtitle, data.excerpt, plain]
          .filter(Boolean)
          .join('\n')
        data.bodyText = plain
        data.readingMinutes = estimateReadingMinutes(plain)
        return data
      },
    ],
    afterChange: [indicizzaArticolo, revalidateArticle, auditChange],
    afterDelete: [rimuoviDaIndice, revalidateArticleOnDelete, auditDelete],
  },

  fields: [
    /* ------------------------------------------------------------------ */
    /* Sidebar: stato, workflow, pubblicazione                            */
    /* ------------------------------------------------------------------ */
    slugField('title'),
    {
      name: 'editorialStatus',
      type: 'select',
      required: true,
      defaultValue: 'bozza',
      label: 'Stato editoriale',
      options: EDITORIAL_STATUSES.map((value) => ({
        value,
        label: EDITORIAL_STATUS_LABELS[value as EditorialStatus],
      })),
      admin: {
        position: 'sidebar',
        description:
          'Bozza, In revisione, Approvato. Solo un articolo Approvato puo essere pubblicato (RF-B-05).',
        components: {
          // In elenco la pastiglia unisce stato editoriale e pubblicazione:
          // vedi statoVisibile() in packages/shared.
          Cell: '@/components/CellaStato#CellaStato',
        },
      },
    },
    {
      name: 'publishedAt',
      type: 'date',
      label: 'Data di pubblicazione',
      index: true,
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd/MM/yyyy HH:mm' },
        description: 'Impostata automaticamente alla prima pubblicazione.',
      },
    },
    {
      name: 'category',
      type: 'relationship',
      relationTo: 'categories',
      required: true,
      index: true,
      label: 'Categoria',
      admin: { position: 'sidebar' },
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
      label: 'Tag',
      admin: { position: 'sidebar' },
    },
    {
      name: 'authors',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      label: 'Firma',
      admin: {
        position: 'sidebar',
        description: 'Chi crea l articolo viene inserito automaticamente.',
      },
    },
    {
      name: 'featured',
      type: 'checkbox',
      defaultValue: false,
      label: 'In evidenza in homepage',
      access: { update: isEditorField },
      admin: {
        position: 'sidebar',
        description: 'Riservato a Editor e Amministratori (RF-P-01).',
      },
    },

    /* ------------------------------------------------------------------ */
    /* Corpo, a schede per non spaventare la redazione (RNF-06)           */
    /* ------------------------------------------------------------------ */
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Contenuto',
          fields: [
            {
              name: 'kicker',
              type: 'text',
              label: 'Occhiello',
              maxLength: 80,
              admin: { description: 'Breve testo sopra il titolo (RF-P-04).' },
            },
            { name: 'title', type: 'text', required: true, label: 'Titolo' },
            { name: 'subtitle', type: 'text', label: 'Sottotitolo', maxLength: 200 },
            {
              name: 'excerpt',
              type: 'textarea',
              label: 'Sommario',
              maxLength: 400,
              admin: {
                description:
                  'Usato nelle anteprime, nel feed RSS e come meta description di riserva.',
              },
            },
            {
              name: 'heroImage',
              type: 'upload',
              relationTo: 'media',
              label: 'Immagine di copertina',
            },
            {
              name: 'content',
              type: 'richText',
              required: true,
              label: 'Testo dell articolo',
              editor: lexicalEditor({
                features: ({ defaultFeatures }) => [
                  ...defaultFeatures,
                  FixedToolbarFeature(),
                  HeadingFeature({ enabledHeadingSizes: ['h2', 'h3', 'h4'] }),
                  HorizontalRuleFeature(),
                  UploadFeature({
                    collections: {
                      media: {
                        fields: [
                          {
                            name: 'alignment',
                            type: 'select',
                            defaultValue: 'center',
                            options: [
                              { value: 'left', label: 'Sinistra' },
                              { value: 'center', label: 'Centro' },
                              { value: 'full', label: 'A tutta larghezza' },
                            ],
                          },
                        ],
                      },
                    },
                  }),
                  BlocksFeature({
                    blocks: [
                      {
                        slug: 'quote',
                        labels: { singular: 'Citazione', plural: 'Citazioni' },
                        fields: [
                          { name: 'text', type: 'textarea', required: true, label: 'Testo' },
                          { name: 'attribution', type: 'text', label: 'Attribuzione' },
                        ],
                      },
                      {
                        slug: 'embed',
                        labels: { singular: 'Embed', plural: 'Embed' },
                        fields: [
                          {
                            name: 'url',
                            type: 'text',
                            required: true,
                            label: 'URL',
                            admin: {
                              description:
                                'YouTube, X, Instagram, Vimeo. L embed viene caricato solo dopo il consenso ai cookie (RF-P-09).',
                            },
                          },
                          { name: 'caption', type: 'text', label: 'Didascalia' },
                        ],
                      },
                    ],
                  }),
                ],
              }),
            },
          ],
        },
        {
          label: 'SEO e social',
          fields: [seoField],
        },
        {
          label: 'Correlati',
          fields: [
            {
              name: 'relatedArticles',
              type: 'relationship',
              relationTo: 'articles',
              hasMany: true,
              maxRows: 4,
              label: 'Articoli correlati',
              filterOptions: ({ id }) => ({ id: { not_equals: id } }),
              admin: {
                description:
                  'Se lasciato vuoto, il portale propone automaticamente articoli della stessa categoria che condividono i tag (RF-P-04).',
              },
            },
          ],
        },
        {
          // RF-AI-11: tracciabilita dell origine assistita, a fini redazionali e di compliance.
          label: 'AI',
          fields: [
            {
              name: 'ai',
              type: 'group',
              label: false,
              fields: [
                {
                  name: 'origin',
                  type: 'select',
                  defaultValue: 'manuale',
                  label: 'Origine del testo',
                  options: AI_ORIGINS.map((value) => ({ value, label: value.replace(/_/g, ' ') })),
                  admin: { readOnly: true },
                },
                {
                  name: 'hotTopic',
                  type: 'relationship',
                  relationTo: 'hot-topics',
                  label: 'Hot topic di origine',
                  admin: { readOnly: true },
                },
                {
                  name: 'model',
                  type: 'text',
                  label: 'Modello utilizzato',
                  admin: { readOnly: true },
                },
                {
                  name: 'generatedAt',
                  type: 'date',
                  label: 'Generato il',
                  admin: { readOnly: true },
                },
                {
                  name: 'brief',
                  type: 'textarea',
                  label: 'Brief fornito alla generazione',
                  admin: { readOnly: true, description: 'RF-AI-05.' },
                },
                {
                  name: 'humanReviewed',
                  type: 'checkbox',
                  defaultValue: false,
                  label: 'Revisionato da un redattore',
                  admin: {
                    description:
                      'Spuntato al passaggio in In revisione. Nessun contenuto AI raggiunge il portale senza questo passaggio (RF-AI-08).',
                  },
                },
              ],
            },
          ],
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    /* Campi derivati, invisibili alla redazione                          */
    /* ------------------------------------------------------------------ */
    {
      name: 'searchText',
      type: 'textarea',
      admin: { hidden: true },
      access: { update: () => false },
    },
    {
      name: 'bodyText',
      type: 'textarea',
      admin: { hidden: true },
      access: { update: () => false },
    },
    {
      name: 'readingMinutes',
      type: 'number',
      admin: { hidden: true },
      access: { update: () => false },
    },
  ],
}
