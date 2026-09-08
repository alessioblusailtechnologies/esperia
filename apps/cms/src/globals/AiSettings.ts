import type { GlobalConfig } from 'payload'
import { isAdmin, isEditor } from '@/access'
import { encryptedText } from '@/fields/encryptedText'

/**
 * Configurazione del modulo AI — RF-AI-03, RF-AI-09, RNF-10.
 *
 * Due principi guidano questo global:
 *
 *  1. L'interruttore generale (`enabled`) e' il primo requisito, non l'ultimo:
 *     RNF-10 impone che portale, community e backoffice restino pienamente
 *     funzionanti quando l'AI non e' disponibile. Spegnere qui deve bastare.
 *
 *  2. Le chiavi API sono intestate al Committente (V-02) e configurabili solo
 *     dall'Amministratore: vengono cifrate a riposo e non escono mai in chiaro
 *     dalle API (vedi src/fields/encryptedText.ts).
 */
export const AiSettings: GlobalConfig = {
  slug: 'ai-settings',
  label: 'Impostazioni AI',
  admin: {
    group: 'Intelligenza artificiale',
    description:
      'Provider, modelli e criteri di rilevanza del modulo AI. I costi delle chiamate sono a carico del Committente.',
  },
  access: {
    read: isEditor, // l'editor deve poter vedere se l'AI e' attiva e con che modello
    update: isAdmin,
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        /* ---------------------------------------------------------------- */
        {
          label: 'Attivazione',
          fields: [
            {
              name: 'enabled',
              type: 'checkbox',
              defaultValue: false,
              label: 'Modulo AI attivo',
              admin: {
                description:
                  'Se disattivato, gli strumenti AI spariscono dal backoffice con un messaggio informativo e il resto della piattaforma continua a funzionare normalmente (RNF-10).',
              },
            },
            {
              name: 'disabledMessage',
              type: 'text',
              label: 'Messaggio mostrato alla redazione',
              defaultValue:
                'Gli strumenti di assistenza AI non sono al momento disponibili. Puoi continuare a lavorare normalmente.',
            },
            {
              name: 'monthlyBudgetEur',
              type: 'number',
              label: 'Tetto di spesa mensile indicativo (EUR)',
              admin: {
                description:
                  'Superata questa soglia il backoffice mostra un avviso. Non blocca le chiamate: serve a rendere visibile il consumo (RF-AI-10).',
              },
            },
          ],
        },

        /* ---------------------------------------------------------------- */
        {
          label: 'Provider e modelli',
          fields: [
            encryptedText({
              name: 'anthropicApiKey',
              label: 'Chiave API Anthropic',
              description:
                'Chiave intestata al Committente. Cifrata prima del salvataggio, mai restituita in chiaro (RF-AI-09).',
            }),
            {
              name: 'textModel',
              type: 'select',
              required: true,
              defaultValue: 'claude-opus-5',
              label: 'Modello per la generazione dei testi',
              options: [
                { value: 'claude-opus-5', label: 'Claude Opus 5 — qualità massima (consigliato)' },
                { value: 'claude-sonnet-5', label: 'Claude Sonnet 5 — equilibrato' },
                { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — rapido ed economico' },
              ],
              admin: {
                description:
                  'Usato per bozze da hot topic e da brief. Il costo per articolo dipende soprattutto da questa scelta.',
              },
            },
            {
              name: 'utilityModel',
              type: 'select',
              required: true,
              defaultValue: 'claude-haiku-4-5',
              label: 'Modello per le operazioni di servizio',
              options: [
                { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (consigliato)' },
                { value: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
                { value: 'claude-opus-5', label: 'Claude Opus 5' },
              ],
              admin: {
                description:
                  'Clustering degli hot topic, titoli alternativi, moderazione automatica. Sono operazioni ad alto volume: qui conviene il modello economico.',
              },
            },
            {
              name: 'effort',
              type: 'select',
              defaultValue: 'high',
              label: 'Profondità di elaborazione',
              options: [
                { value: 'low', label: 'Bassa — veloce ed economica' },
                { value: 'medium', label: 'Media' },
                { value: 'high', label: 'Alta (consigliata)' },
                { value: 'xhigh', label: 'Molto alta — per testi complessi' },
              ],
              admin: {
                description:
                  'Alza la qualità e il costo delle generazioni. Conviene tararla dopo qualche settimana di uso reale.',
              },
            },
            {
              // Il listino serve solo alla stima interna (RF-AI-10): fa fede la fattura del provider.
              name: 'pricing',
              type: 'array',
              label: 'Listino per la stima dei costi',
              admin: {
                description:
                  'Prezzi in USD per milione di token, usati per stimare la spesa nel registro consumi.',
              },
              defaultValue: [
                { model: 'claude-opus-5', inputPerMillion: 5, outputPerMillion: 25 },
                { model: 'claude-sonnet-5', inputPerMillion: 2, outputPerMillion: 10 },
                { model: 'claude-haiku-4-5', inputPerMillion: 1, outputPerMillion: 5 },
              ],
              fields: [
                { name: 'model', type: 'text', required: true, label: 'Modello' },
                { name: 'inputPerMillion', type: 'number', required: true, label: 'Input $/1M' },
                { name: 'outputPerMillion', type: 'number', required: true, label: 'Output $/1M' },
              ],
            },
            {
              name: 'usdToEur',
              type: 'number',
              defaultValue: 0.92,
              label: 'Cambio USD → EUR',
              admin: { description: 'Usato solo per la stima interna dei costi.' },
            },
          ],
        },

        /* ---------------------------------------------------------------- */
        {
          // RF-AI-03: parametri configurabili per orientare la rilevanza.
          label: 'Linea editoriale',
          fields: [
            {
              name: 'editorialProfile',
              type: 'textarea',
              label: 'Descrizione della linea editoriale',
              admin: {
                description:
                  'Testo libero: chi siamo, di cosa ci occupiamo, a chi parliamo, che taglio diamo alle notizie. È il contesto che orienta sia il ranking degli hot topic sia il tono delle bozze generate.',
              },
            },
            {
              name: 'themes',
              type: 'text',
              hasMany: true,
              label: 'Ambiti tematici di interesse',
              admin: { description: 'Es. cronaca locale, economia del mare, politica regionale.' },
            },
            {
              name: 'boostKeywords',
              type: 'text',
              hasMany: true,
              label: 'Parole chiave da privilegiare',
            },
            {
              name: 'excludeKeywords',
              type: 'text',
              hasMany: true,
              label: 'Parole chiave da escludere',
              admin: {
                description: 'Argomenti che non vogliamo mai vedere proposti fra gli hot topic.',
              },
            },
            {
              name: 'toneOfVoice',
              type: 'textarea',
              label: 'Indicazioni di stile per le bozze',
              defaultValue:
                'Italiano corretto e sobrio. Periodi brevi. Nessun sensazionalismo, nessun aggettivo superfluo. Attacco che risponde subito a chi, cosa, quando, dove.',
            },
            {
              name: 'minScore',
              type: 'number',
              defaultValue: 30,
              min: 0,
              max: 100,
              label: 'Soglia minima di rilevanza',
              admin: {
                description:
                  'Gli argomenti sotto questo punteggio non vengono proposti alla redazione. Alzarla riduce il rumore, abbassarla amplia il campo.',
              },
            },
            {
              name: 'maxTopicsPerRun',
              type: 'number',
              defaultValue: 15,
              min: 1,
              max: 100,
              label: 'Numero massimo di argomenti per esecuzione',
            },
          ],
        },

        /* ---------------------------------------------------------------- */
        {
          label: 'Immagini',
          fields: [
            {
              name: 'imagesEnabled',
              type: 'checkbox',
              defaultValue: false,
              label: 'Generazione immagini attiva (RF-AI-07)',
            },
            {
              name: 'imageProvider',
              type: 'select',
              defaultValue: 'nessuno',
              label: 'Provider immagini',
              options: [
                { value: 'nessuno', label: 'Nessuno' },
                { value: 'openai', label: 'OpenAI Images' },
                { value: 'stability', label: 'Stability AI' },
                { value: 'replicate', label: 'Replicate' },
              ],
              admin: { condition: (data) => Boolean(data?.imagesEnabled) },
            },
            encryptedText({
              name: 'imageApiKey',
              label: 'Chiave API del provider immagini',
            }),
            {
              name: 'imageDisclaimer',
              type: 'text',
              label: 'Dicitura applicata alle immagini generate',
              defaultValue: 'Immagine generata con intelligenza artificiale',
              admin: {
                description:
                  'Inserita nei crediti dell’immagine. Serve a non spacciare per fotografia ciò che non lo è.',
              },
            },
          ],
        },
      ],
    },
  ],
}
