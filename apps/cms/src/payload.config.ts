import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { it } from '@payloadcms/translations/languages/it'
import sharp from 'sharp'

import { Users } from '@/collections/Users'
import { Media } from '@/collections/Media'
import { Categories } from '@/collections/Categories'
import { Tags } from '@/collections/Tags'
import { Articles } from '@/collections/Articles'
import { Pages } from '@/collections/Pages'
import { Redirects } from '@/collections/Redirects'
import { Sources } from '@/collections/Sources'
import { HotTopics } from '@/collections/HotTopics'
import { NewsItems } from '@/collections/NewsItems'
import { AiUsage } from '@/collections/AiUsage'
import { AuditLog } from '@/collections/AuditLog'
import { searchEndpoint } from '@/endpoints/search'
import { generaBozzaEndpoint } from '@/endpoints/generaBozza'
import { SiteSettings } from '@/globals/SiteSettings'
import { AiSettings } from '@/globals/AiSettings'
import { rilevaHotTopicTask } from '@/jobs/rilevaHotTopic'
import { anonimizzaAccountTask } from '@/jobs/anonimizzaAccount'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const portalUrl = process.env.PORTAL_URL ?? 'http://localhost:4321'
const serverUrl = process.env.PAYLOAD_PUBLIC_SERVER_URL ?? 'http://localhost:3001'

/** Storage S3-compatible: attivo solo se configurato, altrimenti si scrive su disco locale. */
const storagePlugins = process.env.S3_BUCKET
  ? [
      s3Storage({
        collections: { media: { prefix: 'media' } },
        bucket: process.env.S3_BUCKET,
        config: {
          region: process.env.S3_REGION ?? 'eu-central-1',
          endpoint: process.env.S3_ENDPOINT,
          forcePathStyle: true, // richiesto da Supabase Storage e da MinIO
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
          },
        },
      }),
    ]
  : []

export default buildConfig({
  serverURL: serverUrl,

  admin: {
    user: Users.slug,
    // Il tema Esperia è disegnato in chiaro: la variante scura di Payload
    // mescolerebbe i suoi grigi freddi con la nostra scala calda.
    theme: 'light',
    // Date all'italiana in elenchi e intestazioni («5 ott 2026, 14:56»).
    dateFormat: 'd MMM yyyy, HH:mm',
    meta: {
      titleSuffix: ' — Esperia',
      description: 'Backoffice editoriale della piattaforma Esperia',
    },

    /*
     * Personalizzazioni dell'interfaccia — dai design (Pagine backoffice).
     *
     * Sostituiamo cio' che i design ridisegnano davvero (navigazione,
     * dashboard) e aggiungiamo le due schermate che in Payload non esistono
     * (moderazione della community e hot topic). Le bozze AI nascono dalla
     * finestra «Nuovo articolo» della navigazione, non da una vista propria.
     * Elenchi, editor, media library e gestione utenti restano quelli di
     * Payload, ri-tematizzati: sono esattamente le funzioni per cui lo
     * abbiamo scelto e riscriverle vorrebbe dire buttare via versioni,
     * bozze, permessi e validazioni gia' pronti.
     */
    components: {
      Nav: '@/components/nav/NavLaterale#NavLaterale',
      graphics: {
        Logo: '@/components/Marchio#Logo',
        Icon: '@/components/Marchio#Icona',
      },
      views: {
        // La Scrivania (views/Dashboard) è sospesa: /admin porta agli articoli.
        dashboard: {
          Component: '@/components/views/Ingresso#Ingresso',
        },
        moderazione: {
          Component: '@/components/views/Moderazione#Moderazione',
          path: '/moderazione',
          meta: { title: 'Moderazione' },
        },
        hotTopic: {
          Component: '@/components/views/HotTopic#HotTopic',
          path: '/hot-topic',
          meta: { title: 'Hot topic' },
        },
      },
    },
  },

  // RNF-09: la piattaforma e i contenuti sono in italiano; il multilingua e' fuori perimetro.
  i18n: {
    supportedLanguages: { it },
    fallbackLanguage: 'it',
    // Alcune traduzioni di Payload suonano meccaniche («<No Titolo>»,
    // «Modificare», «Crea Nuovo»): le riscriviamo nel tono del backoffice.
    translations: {
      it: {
        general: {
          createNew: 'Nuovo',
          // Forme neutre al genere: «un nuovo Categoria» è sbagliato, e la
          // stessa frase serve a categorie, tag, articoli, immagini.
          createNewLabel: 'Aggiungi {{label}}',
          creatingNewLabel: 'Aggiungi {{label}}',
          newLabel: 'Aggiungi {{label}}',
          edit: 'Modifica',
          noLabel: '—',
          loading: 'Caricamento…',
          perPage: 'Per pagina: {{limit}}',
          searchBy: 'Cerca per {{label}}',
          selectValue: 'Scegli…',
          columns: 'Colonne',
          filters: 'Filtri',
          true: 'Sì',
          false: 'No',
        },
        fields: {
          chooseFromExisting: 'Scegli dall’archivio',
          addNew: 'Aggiungi',
          addNewLabel: 'Aggiungi {{label}}',
          newLabel: 'Aggiungi {{label}}',
          uploadNewLabel: 'Carica {{label}}',
        },
        upload: {
          dragAndDropHere: 'oppure trascina qui un file',
          bulkUpload: 'Carica più file',
        },
      },
    },
  },

  collections: [
    Articles,
    Categories,
    Tags,
    Media,
    Pages,
    HotTopics,
    Sources,
    NewsItems,
    Users,
    Redirects,
    AiUsage,
    AuditLog,
  ],

  globals: [SiteSettings, AiSettings],

  // Endpoint applicativi che non sono semplici CRUD.
  endpoints: [searchEndpoint, generaBozzaEndpoint],

  editor: lexicalEditor({}),

  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URI ?? '' },
    // Payload vive in uno schema dedicato: lo schema `public` resta a Supabase,
    // che lo espone via PostgREST alla community. Cosi' le tabelle del CMS non
    // sono raggiungibili dall'API pubblica nemmeno per errore.
    schemaName: 'payload',
    // Gli id sono UUID perche' vengono referenziati da un altro schema (i commenti)
    // e comparirebbero altrimenti come contatori prevedibili nelle API.
    idType: 'uuid',
    migrationDir: path.resolve(dirname, '../migrations'),
  }),

  // Coda di job: serve alla pubblicazione programmata (RF-B-06) e all'ingestione
  // delle fonti (RF-AI-01). In produzione si puo' spostare su un worker separato
  // disattivando autoRun e chiamando /api/payload-jobs/run da un cron esterno.
  jobs: {
    tasks: [rilevaHotTopicTask, anonimizzaAccountTask],
    autoRun: [
      {
        cron: '* * * * *',
        limit: 20,
        queue: 'default',
      },
    ],
    shouldAutoRun: async () => process.env.DISABLE_JOBS !== 'true',
  },

  // Il portale e' su un'altra origine: senza queste voci le fetch dal browser
  // e le form del backoffice verrebbero bloccate.
  cors: [portalUrl, serverUrl].filter(Boolean),
  csrf: [portalUrl, serverUrl].filter(Boolean),

  secret: process.env.PAYLOAD_SECRET ?? '',

  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },

  sharp,

  plugins: [...storagePlugins],

  upload: {
    limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  },
})
