import type { CollectionConfig } from 'payload'
import { anyone, isEditor, authenticated } from '@/access'
import { slugField } from '@/fields/slug'
import { seoField } from '@/fields/seo'
import { revalidateAll } from '@/hooks/revalidatePortal'

/**
 * Categorie — RF-P-02, RF-B-08.
 *
 * Tassonomia principale: un articolo appartiene a UNA categoria (che determina
 * il suo posto nella navigazione) e a N tag. Tenerle distinte evita l'ambiguita'
 * classica dei CMS in cui tutto e' un termine e nessuno sa cosa mostrare nel menu.
 */
export const Categories: CollectionConfig = {
  slug: 'categories',
  labels: { singular: 'Categoria', plural: 'Categorie' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'order'],
    group: 'Contenuti',
  },
  access: {
    read: anyone,
    create: isEditor,
    update: isEditor,
    delete: isEditor,
  },
  hooks: {
    afterChange: [revalidateAll],
  },
  defaultSort: 'order',
  fields: [
    { name: 'name', type: 'text', required: true, label: 'Nome' },
    slugField('name'),
    {
      name: 'description',
      type: 'textarea',
      label: 'Descrizione',
      admin: { description: 'Mostrata in testa alla pagina di categoria. Utile anche per la SEO.' },
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 100,
      label: 'Ordine nel menu',
      admin: {
        position: 'sidebar',
        step: 10,
        description: 'Valori più bassi compaiono prima. RF-B-08.',
      },
    },
    {
      name: 'color',
      type: 'text',
      label: 'Colore identificativo',
      admin: {
        position: 'sidebar',
        description: 'Codice esadecimale (es. #C81E1E) usato dal portale per etichettare la categoria.',
      },
      validate: (value: unknown) =>
        !value || /^#[0-9a-fA-F]{6}$/.test(String(value))
          ? true
          : 'Usare il formato esadecimale a 6 cifre, es. #C81E1E.',
    },
    {
      name: 'showInMenu',
      type: 'checkbox',
      defaultValue: true,
      label: 'Mostra nel menu principale',
      admin: { position: 'sidebar' },
    },
    seoField,
  ],
}
