import type { CollectionConfig } from 'payload'
import { anyone, isEditor } from '@/access'
import { auditChange } from '@/hooks/auditLog'
import { revalidateAll } from '@/hooks/revalidatePortal'

/** Normalizza un percorso: sempre con lo slash iniziale, mai con quello finale. */
const normalizePath = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  let p = value.trim()
  if (p === '') return undefined
  if (!p.startsWith('/') && !p.startsWith('http')) p = `/${p}`
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  return p
}

/**
 * Gestione dei redirect — RF-P-07.
 *
 * Serve ogni volta che cambia uno slug pubblicato o che si migra un contenuto
 * dal vecchio sito: senza 301 si perdono posizionamento e link in ingresso.
 * Il portale li applica in middleware, prima di qualsiasi rendering.
 */
export const Redirects: CollectionConfig = {
  slug: 'redirects',
  labels: { singular: 'Redirect', plural: 'Redirect' },
  admin: {
    useAsTitle: 'from',
    defaultColumns: ['from', 'to', 'type', 'active'],
    group: 'Amministrazione',
    description: 'Reindirizzamenti applicati dal portale prima di servire una pagina.',
  },
  access: {
    read: anyone, // il portale li legge senza autenticazione all'avvio e a ogni invalidazione
    create: isEditor,
    update: isEditor,
    delete: isEditor,
  },
  hooks: {
    afterChange: [revalidateAll, auditChange],
  },
  fields: [
    {
      name: 'from',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      label: 'Da (percorso di origine)',
      admin: { description: 'Es. /vecchia-sezione/articolo-di-ieri' },
      hooks: { beforeValidate: [({ value }) => normalizePath(value)] },
    },
    {
      name: 'to',
      type: 'text',
      required: true,
      label: 'A (destinazione)',
      admin: { description: 'Percorso interno (es. /nuovo-articolo) oppure URL assoluto.' },
      hooks: { beforeValidate: [({ value }) => normalizePath(value)] },
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: '301',
      label: 'Tipo',
      options: [
        { value: '301', label: '301 — permanente (trasferisce il posizionamento)' },
        { value: '302', label: '302 — temporaneo' },
      ],
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      label: 'Attivo',
      admin: { position: 'sidebar' },
    },
    {
      name: 'note',
      type: 'text',
      label: 'Nota interna',
      admin: { description: 'Perche esiste questo redirect. Aiuta chi lo ritrovera fra sei mesi.' },
    },
  ],
}
