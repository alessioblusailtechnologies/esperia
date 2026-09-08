import type { CollectionConfig } from 'payload'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { isEditor, publishedOrStaffSimple } from '@/access'
import { slugField } from '@/fields/slug'
import { seoField } from '@/fields/seo'
import { revalidateAll } from '@/hooks/revalidatePortal'
import { auditChange, auditDelete } from '@/hooks/auditLog'

/**
 * Pagine editoriali di servizio — RF-P-10.
 *
 * Chi siamo, contatti, privacy policy, cookie policy. I testi legali li fornisce
 * il Committente (RNF-04): qui servono solo il contenitore e un URL stabile.
 */
export const Pages: CollectionConfig = {
  slug: 'pages',
  labels: { singular: 'Pagina', plural: 'Pagine' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', '_status', 'updatedAt'],
    group: 'Contenuti',
  },
  access: {
    read: publishedOrStaffSimple,
    create: isEditor,
    update: isEditor,
    delete: isEditor,
  },
  versions: {
    maxPerDoc: 10,
    drafts: true,
  },
  hooks: {
    afterChange: [revalidateAll, auditChange],
    afterDelete: [auditDelete],
  },
  fields: [
    slugField('title'),
    { name: 'title', type: 'text', required: true, label: 'Titolo' },
    {
      name: 'content',
      type: 'richText',
      required: true,
      label: 'Contenuto',
      editor: lexicalEditor({}),
    },
    {
      name: 'showInFooter',
      type: 'checkbox',
      defaultValue: false,
      label: 'Mostra nel footer',
      admin: { position: 'sidebar' },
    },
    {
      name: 'footerOrder',
      type: 'number',
      defaultValue: 100,
      label: 'Ordine nel footer',
      admin: { position: 'sidebar', step: 10, condition: (data) => Boolean(data?.showInFooter) },
    },
    seoField,
  ],
}
