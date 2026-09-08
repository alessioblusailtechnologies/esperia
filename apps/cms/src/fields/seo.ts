import type { Field } from 'payload'
import { SEO_LIMITS } from '@esperia/shared'

/**
 * Campi SEO per singolo documento — RF-B-09, RF-P-06, RF-P-07.
 *
 * I valori restano volutamente opzionali: il portale ha dei fallback
 * (titolo -> metaTitle, excerpt -> metaDescription, heroImage -> ogImage)
 * cosi' la redazione non e' obbligata a compilarli per pubblicare.
 */
export const seoField: Field = {
  name: 'seo',
  type: 'group',
  label: 'SEO e condivisione',
  admin: {
    description:
      'Se lasciati vuoti, il portale usa titolo, sommario e immagine di copertina dell’articolo.',
  },
  fields: [
    {
      name: 'metaTitle',
      type: 'text',
      label: 'Meta title',
      maxLength: 120,
      admin: {
        description: `Consigliati max ${SEO_LIMITS.metaTitle} caratteri: oltre, Google tronca il titolo nei risultati.`,
      },
    },
    {
      name: 'metaDescription',
      type: 'textarea',
      label: 'Meta description',
      maxLength: 320,
      admin: {
        description: `Consigliati max ${SEO_LIMITS.metaDescription} caratteri.`,
      },
    },
    {
      name: 'ogImage',
      type: 'upload',
      relationTo: 'media',
      label: 'Immagine per la condivisione social',
      admin: {
        description: 'Formato ideale 1200×630. Usata da Open Graph e Twitter Card (RF-P-06).',
      },
    },
    {
      name: 'canonicalUrl',
      type: 'text',
      label: 'URL canonico',
      admin: {
        description:
          'Solo se il contenuto è pubblicato in originale altrove. Lasciare vuoto nella quasi totalità dei casi.',
      },
      validate: (value: unknown) => {
        if (!value) return true
        try {
          new URL(String(value))
          return true
        } catch {
          return 'Inserire un URL assoluto valido (es. https://esempio.it/articolo).'
        }
      },
    },
    {
      name: 'noIndex',
      type: 'checkbox',
      label: 'Escludi dai motori di ricerca (noindex)',
      defaultValue: false,
    },
  ],
}
