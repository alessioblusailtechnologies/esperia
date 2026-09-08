import type { CollectionConfig } from 'payload'
import { STAFF_ROLES, STAFF_ROLE_LABELS } from '@esperia/shared'
import { canReadUser, canUpdateUser, isAdmin, isAdminField } from '@/access'

/**
 * Account di backoffice — RF-B-01, RF-B-02, RF-B-11.
 *
 * Collection DISTINTA dagli utenti community, che vivono in Supabase Auth.
 * La separazione e' un requisito esplicito (RF-B-01): un lettore registrato
 * non deve poter tentare il login sul backoffice, nemmeno per errore.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Utente backoffice', plural: 'Utenti backoffice' },
  auth: {
    tokenExpiration: 60 * 60 * 8, // giornata lavorativa
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
    verify: false, // gli account staff li crea l'Amministratore, non c'e' self-signup
    forgotPassword: {
      generateEmailSubject: () => 'Esperia — reimposta la tua password',
    },
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'role', 'active'],
    group: 'Amministrazione',
  },
  access: {
    read: canReadUser,
    create: isAdmin,
    update: canUpdateUser,
    delete: isAdmin,
    admin: ({ req }) => Boolean(req.user), // chiunque sia autenticato puo' entrare in /admin
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: 'Nome e cognome',
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'redattore',
      label: 'Ruolo',
      options: STAFF_ROLES.map((value) => ({ value, label: STAFF_ROLE_LABELS[value] })),
      // Nessuno puo' promuovere se stesso: la modifica del ruolo e' solo dell'Amministratore.
      access: { create: isAdminField, update: isAdminField },
      admin: { position: 'sidebar' },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      label: 'Account attivo',
      access: { update: isAdminField },
      admin: {
        position: 'sidebar',
        description:
          'Disattivare invece di eliminare: cosi’ gli articoli firmati restano attribuiti correttamente.',
      },
    },
    {
      name: 'avatar',
      type: 'upload',
      relationTo: 'media',
      label: 'Foto',
    },
    {
      name: 'bio',
      type: 'textarea',
      label: 'Biografia',
      admin: { description: 'Mostrata nella pagina autore del portale.' },
    },
  ],
}
