import type { CollectionConfig } from 'payload'
import { anyone, authenticated, isEditor } from '@/access'
import { slugField } from '@/fields/slug'

/**
 * Tag — RF-P-03, RF-B-08.
 *
 * A differenza delle categorie, i tag li puo' creare anche un redattore mentre
 * scrive: bloccarli dietro il ruolo editor porterebbe solo a tag non usati.
 */
export const Tags: CollectionConfig = {
  slug: 'tags',
  labels: { singular: 'Tag', plural: 'Tag' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug'],
    group: 'Contenuti',
  },
  access: {
    read: anyone,
    create: authenticated,
    update: authenticated,
    delete: isEditor,
  },
  fields: [
    { name: 'name', type: 'text', required: true, label: 'Nome' },
    slugField('name'),
    {
      name: 'description',
      type: 'textarea',
      label: 'Descrizione',
    },
  ],
}
