import type { GlobalConfig } from 'payload'
import { anyone, isAdmin, isEditor } from '@/access'
import { revalidateAll } from '@/hooks/revalidatePortal'

/**
 * Configurazione del portale pubblico.
 * Copre RF-P-01 (evidenza in homepage), RF-P-06, RF-P-09 e RNF-04.
 */
export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Impostazioni portale',
  admin: { group: 'Amministrazione' },
  access: {
    read: anyone, // il portale le legge a ogni build/rigenerazione
    update: isEditor,
  },
  hooks: {
    afterChange: [
      async ({ doc, req }) => {
        await revalidateAll({ doc, req } as never)
        return doc
      },
    ],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Identita',
          fields: [
            { name: 'siteName', type: 'text', required: true, defaultValue: 'Esperia' },
            {
              name: 'tagline',
              type: 'text',
              label: 'Sottotitolo',
              admin: { description: 'Compare accanto al nome nei risultati di ricerca e nel feed.' },
            },
            { name: 'logo', type: 'upload', relationTo: 'media', label: 'Logo' },
            {
              name: 'defaultOgImage',
              type: 'upload',
              relationTo: 'media',
              label: 'Immagine social di riserva',
              admin: {
                description:
                  'Usata quando un contenuto non ha ne immagine social ne copertina (RF-P-06). Formato 1200x630.',
              },
            },
            {
              name: 'publisherName',
              type: 'text',
              label: 'Editore',
              admin: {
                description:
                  'Ragione sociale usata nei dati strutturati schema.org come Publisher (RF-P-07).',
              },
            },
            /*
             * Dati obbligatori per una testata giornalistica registrata.
             * Compaiono nel piede di ogni pagina: sono dati del Committente,
             * non costanti del codice.
             */
            {
              name: 'legalNotice',
              type: 'textarea',
              label: 'Dicitura di registrazione',
              admin: {
                description:
                  'Es. "Quotidiano online di politica e attualità. Registrazione Tribunale di Roma n. 214/2024."',
              },
            },
            {
              name: 'companyDetails',
              type: 'text',
              label: 'Dati societari',
              admin: { description: 'Es. "P. IVA 04871230581 — Via dei Serpenti 42, 00184 Roma".' },
            },
            {
              name: 'editorInChief',
              type: 'text',
              label: 'Direttore responsabile',
            },
          ],
        },
        {
          label: 'Homepage',
          fields: [
            {
              name: 'featuredArticles',
              type: 'relationship',
              relationTo: 'articles',
              hasMany: true,
              maxRows: 5,
              label: 'Apertura manuale',
              admin: {
                description:
                  'Se valorizzata, ha la precedenza sugli articoli marcati In evidenza. Vuota = ordinamento automatico per data (RF-P-01).',
              },
            },
            {
              name: 'homeSections',
              type: 'array',
              label: 'Sezioni della homepage',
              admin: { description: 'Blocchi di categoria mostrati sotto le ultime notizie.' },
              fields: [
                {
                  name: 'category',
                  type: 'relationship',
                  relationTo: 'categories',
                  required: true,
                },
                { name: 'title', type: 'text', label: 'Titolo della sezione' },
                { name: 'limit', type: 'number', defaultValue: 4, min: 2, max: 12 },
              ],
            },
          ],
        },
        {
          label: 'Social e contatti',
          fields: [
            {
              name: 'social',
              type: 'array',
              label: 'Profili social',
              fields: [
                {
                  name: 'platform',
                  type: 'select',
                  required: true,
                  options: [
                    { value: 'facebook', label: 'Facebook' },
                    { value: 'instagram', label: 'Instagram' },
                    { value: 'x', label: 'X' },
                    { value: 'linkedin', label: 'LinkedIn' },
                    { value: 'youtube', label: 'YouTube' },
                    { value: 'tiktok', label: 'TikTok' },
                  ],
                },
                { name: 'url', type: 'text', required: true },
              ],
            },
            {
              name: 'twitterHandle',
              type: 'text',
              label: 'Handle X/Twitter',
              admin: { description: 'Senza @. Usato nella Twitter Card (RF-P-06).' },
            },
            { name: 'contactEmail', type: 'email', label: 'Email di redazione' },
          ],
        },
        {
          // RF-P-09 e RNF-04. I testi delle policy li fornisce il Committente.
          label: 'Cookie e privacy',
          fields: [
            {
              name: 'cookieBanner',
              type: 'group',
              label: false,
              fields: [
                {
                  name: 'enabled',
                  type: 'checkbox',
                  defaultValue: true,
                  label: 'Mostra il banner cookie',
                },
                {
                  name: 'message',
                  type: 'textarea',
                  label: 'Testo del banner',
                  defaultValue:
                    'Usiamo cookie tecnici necessari al funzionamento del sito e, previo consenso, cookie di misurazione e contenuti di terze parti.',
                },
                {
                  name: 'privacyPage',
                  type: 'relationship',
                  relationTo: 'pages',
                  label: 'Pagina privacy policy',
                },
                {
                  name: 'cookiePage',
                  type: 'relationship',
                  relationTo: 'pages',
                  label: 'Pagina cookie policy',
                },
              ],
            },
            {
              name: 'analytics',
              type: 'group',
              label: 'Misurazione',
              fields: [
                {
                  name: 'provider',
                  type: 'select',
                  defaultValue: 'nessuno',
                  options: [
                    { value: 'nessuno', label: 'Nessuno' },
                    { value: 'plausible', label: 'Plausible (senza cookie)' },
                    { value: 'umami', label: 'Umami (senza cookie)' },
                    { value: 'ga4', label: 'Google Analytics 4 (richiede consenso)' },
                  ],
                  admin: {
                    description:
                      'Plausible e Umami non usano cookie e non richiedono consenso preventivo: sono la scelta piu semplice sul piano GDPR (RNF-04).',
                  },
                },
                {
                  name: 'siteId',
                  type: 'text',
                  label: 'ID sito / misurazione',
                  admin: { condition: (data) => data?.analytics?.provider !== 'nessuno' },
                },
                {
                  name: 'scriptUrl',
                  type: 'text',
                  label: 'URL dello script (self-hosted)',
                  admin: {
                    condition: (data) => ['plausible', 'umami'].includes(data?.analytics?.provider),
                  },
                },
              ],
            },
          ],
        },
        {
          label: 'Manutenzione',
          fields: [
            {
              name: 'maintenanceMode',
              type: 'checkbox',
              defaultValue: false,
              label: 'Modalita manutenzione del portale',
              access: { update: () => true },
            },
            {
              name: 'maintenanceMessage',
              type: 'textarea',
              label: 'Messaggio mostrato ai visitatori',
              admin: { condition: (data) => Boolean(data?.maintenanceMode) },
            },
          ],
        },
      ],
    },
  ],
}
