import type { CollectionConfig } from 'payload'
import { anyone, authenticated, isEditor } from '@/access'

/**
 * Media library — RF-B-07.
 *
 * Le varianti sono generate una volta al caricamento (sharp) e servite statiche:
 * il portale non fa trasformazioni a runtime, cosi' l'ottimizzazione immagini
 * non dipende da una CDN a pagamento (RNF-01, e V-02 sui costi a carico del Committente).
 */
export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'Media', plural: 'Media library' },
  admin: {
    group: 'Contenuti',
    defaultColumns: ['filename', 'alt', 'mimeType', 'filesize'],
  },
  hooks: {
    beforeChange: [
      /*
       * RF-AI-07: un'immagine generata porta sempre la dicitura nei crediti, che
       * il portale mostra sotto la foto. Si rimette anche se qualcuno la toglie
       * modificando i crediti: e' cio' che impedisce di spacciarla per fotografia.
       */
      async ({ data, originalDoc, req }) => {
        const generata = data.aiGenerated ?? originalDoc?.aiGenerated
        if (!generata) return data

        const g = (await req.payload
          .findGlobal({ slug: 'ai-settings', overrideAccess: true, depth: 0 })
          .catch(() => ({}))) as { imageDisclaimer?: string }
        const dicitura = g.imageDisclaimer || 'Immagine generata con intelligenza artificiale'

        const crediti: string = (data.credit ?? originalDoc?.credit ?? '').trim()
        if (!crediti.toLowerCase().includes(dicitura.toLowerCase())) {
          data.credit = crediti ? `${crediti} · ${dicitura}` : dicitura
        }
        return data
      },
    ],
  },
  access: {
    read: anyone, // i file pubblicati devono essere raggiungibili dal portale
    create: authenticated,
    update: authenticated,
    delete: isEditor,
  },
  upload: {
    mimeTypes: ['image/*', 'application/pdf'],
    focalPoint: true,
    crop: true,
    formatOptions: {
      format: 'webp',
      options: { quality: 82 },
    },
    imageSizes: [
      { name: 'thumbnail', width: 400, height: 300, position: 'centre' },
      { name: 'card', width: 768, height: 512, position: 'centre' },
      { name: 'hero', width: 1600, height: 900, position: 'centre' },
      // Open Graph vuole esattamente 1200x630 — RF-P-06
      { name: 'og', width: 1200, height: 630, position: 'centre' },
    ],
    adminThumbnail: 'thumbnail',
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      label: 'Testo alternativo',
      admin: {
        description:
          'Descrive l’immagine a chi usa uno screen reader ed è richiesto dalle linee guida di accessibilità (RNF-07). Obbligatorio.',
      },
    },
    {
      name: 'caption',
      type: 'text',
      label: 'Didascalia',
    },
    {
      name: 'credit',
      type: 'text',
      label: 'Crediti / fonte',
      admin: { description: 'Es. “Foto: Ansa”. Mostrato sotto l’immagine nell’articolo.' },
    },
    {
      name: 'aiGenerated',
      type: 'checkbox',
      defaultValue: false,
      label: 'Immagine generata da AI',
      // Lo imposta solo il modulo AI (con overrideAccess): toglierlo a mano
      // permetterebbe di far passare un'immagine generata per una fotografia.
      access: { create: () => false, update: () => false },
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Impostato automaticamente quando l’immagine arriva dal modulo AI (RF-AI-07).',
      },
    },
  ],
}
