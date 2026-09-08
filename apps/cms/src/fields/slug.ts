import type { Field } from 'payload'
import { slugify, SEO_LIMITS } from '@esperia/shared'

/**
 * Slug personalizzabile ma sempre valido — RF-P-07 (URL parlanti), RF-B-09.
 *
 * Nota: lo slug NON viene ricalcolato quando cambia il titolo di un documento
 * gia' pubblicato. Cambiare l'URL di un articolo online rompe i link esterni e
 * il posizionamento; se serve farlo si crea un redirect (collection `redirects`).
 */
export function slugField(sourceField = 'title'): Field {
  return {
    name: 'slug',
    type: 'text',
    unique: true,
    index: true,
    required: true,
    maxLength: SEO_LIMITS.slug,
    label: 'Slug (URL)',
    admin: {
      position: 'sidebar',
      description:
        'Parte finale dell’indirizzo della pagina. Si genera dal titolo; modificandolo dopo la pubblicazione ricordarsi di creare un redirect.',
    },
    hooks: {
      beforeValidate: [
        ({ value, data, originalDoc }) => {
          if (typeof value === 'string' && value.trim() !== '') return slugify(value)

          // Primo salvataggio senza slug: lo deriviamo dalla fonte.
          const source = (data?.[sourceField] ?? originalDoc?.[sourceField]) as unknown
          if (typeof source === 'string' && source.trim() !== '') return slugify(source)

          return value
        },
      ],
    },
  }
}
