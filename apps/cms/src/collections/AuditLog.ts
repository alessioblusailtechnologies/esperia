import type { CollectionConfig } from 'payload'
import { isAdmin } from '@/access'

/**
 * Tracciamento delle operazioni rilevanti del backoffice — RNF-08.
 *
 * Immutabile per costruzione: nessuno puo' crearlo, modificarlo o cancellarlo
 * dall'interfaccia. Un log che si puo' riscrivere non e' un log.
 */
export const AuditLog: CollectionConfig = {
  slug: 'audit-log',
  labels: { singular: 'Voce di registro', plural: 'Registro operazioni' },
  admin: {
    useAsTitle: 'documentLabel',
    defaultColumns: ['createdAt', 'user', 'action', 'collectionSlug', 'documentLabel'],
    group: 'Amministrazione',
    description: 'Chi ha fatto cosa, e quando. Sola lettura.',
  },
  access: {
    read: isAdmin,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  defaultSort: '-createdAt',
  timestamps: true,
  fields: [
    {
      name: 'action',
      type: 'select',
      required: true,
      label: 'Azione',
      options: [
        { value: 'creazione', label: 'Creazione' },
        { value: 'modifica', label: 'Modifica' },
        { value: 'eliminazione', label: 'Eliminazione' },
      ],
    },
    { name: 'collectionSlug', type: 'text', required: true, label: 'Tipo di contenuto', index: true },
    { name: 'documentId', type: 'text', required: true, label: 'ID documento', index: true },
    { name: 'documentLabel', type: 'text', label: 'Documento' },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      label: 'Utente',
      index: true,
    },
    { name: 'statusFrom', type: 'text', label: 'Stato precedente' },
    { name: 'statusTo', type: 'text', label: 'Stato successivo' },
    {
      name: 'changedFields',
      type: 'json',
      label: 'Campi modificati',
      admin: { description: 'Solo i nomi dei campi: il contenuto e nelle revisioni (RF-B-13).' },
    },
    { name: 'ip', type: 'text', label: 'Indirizzo IP' },
  ],
}
