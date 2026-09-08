import { headers as intestazioni } from 'next/headers'
import type { Payload } from 'payload'
import { STAFF_ROLE_LABELS, type StaffRole } from '@esperia/shared'

import { contaModerazione } from '@/lib/supabase'
import { VociNav, type VoceNav } from './VociNav'

import './NavLaterale.scss'

/**
 * Navigazione laterale del backoffice — dai design (Nav Laterale v1).
 *
 * Sostituisce la nav predefinita di Payload, che elenca le collection in ordine
 * di configurazione. Qui l'ordine è quello del lavoro redazionale, e accanto
 * alle voci che richiedono un'azione compare quante ne sono in attesa: è
 * l'unica informazione che fa aprire una schermata invece di un'altra.
 *
 * Componente server: i conteggi si leggono qui, una volta per richiesta,
 * invece di far partire tre fetch dal browser a ogni cambio pagina.
 */

type Props = {
  payload?: Payload
  user?: { name?: string | null; email?: string | null; role?: StaffRole | null } | null
}

async function conteggi(payload: Payload | undefined) {
  if (!payload) return { articoli: 0, hotTopic: 0, moderazione: 0 }

  // Nessun conteggio deve poter far fallire il rendering della navigazione:
  // al peggio le pastiglie restano vuote (RNF-10).
  const sicuro = async (fn: () => Promise<number>) => {
    try {
      return await fn()
    } catch {
      return 0
    }
  }

  const [articoli, hotTopic, moderazione] = await Promise.all([
    sicuro(async () => (await payload.count({ collection: 'articles', overrideAccess: true })).totalDocs),
    sicuro(
      async () =>
        (
          await payload.count({
            collection: 'hot-topics',
            where: { status: { equals: 'nuovo' } },
            overrideAccess: true,
          })
        ).totalDocs,
    ),
    sicuro(async () => {
      const c = await contaModerazione()
      return c.inAttesa + c.segnalazioniAperte
    }),
  ])

  return { articoli, hotTopic, moderazione }
}

/**
 * Chi sta usando il backoffice.
 *
 * Payload passa `user` fra le props quando monta la nav dalle proprie viste,
 * ma non lo fa attraverso DefaultTemplate nelle viste personalizzate: senza
 * questo ripiego il piede della colonna mostrerebbe un nome generico proprio
 * nelle tre schermate che abbiamo aggiunto noi.
 */
async function utenteCorrente(
  payload: Payload | undefined,
  daProps: Props['user'],
): Promise<Props['user']> {
  if (daProps?.name || daProps?.email) return daProps
  if (!payload) return daProps

  try {
    const { user } = await payload.auth({ headers: await intestazioni() })
    return (user as Props['user']) ?? daProps
  } catch {
    return daProps
  }
}

export async function NavLaterale({ payload, user: userProp }: Props) {
  const [n, user] = await Promise.all([conteggi(payload), utenteCorrente(payload, userProp)])

  const voci: VoceNav[] = [
    { etichetta: 'Dashboard', href: '/admin', esatto: true },
    { etichetta: 'Articoli', href: '/admin/collections/articles', conteggio: n.articoli },
    { etichetta: 'Hot topic AI', href: '/admin/hot-topic', conteggio: n.hotTopic },
    { etichetta: 'Genera da brief', href: '/admin/genera-da-brief' },
    { etichetta: 'Media', href: '/admin/collections/media' },
    { etichetta: 'Categorie e tag', href: '/admin/collections/categories' },
    { etichetta: 'Moderazione', href: '/admin/moderazione', conteggio: n.moderazione },
    { etichetta: 'Utenti', href: '/admin/collections/users' },
    { etichetta: 'Impostazioni', href: '/admin/globals/site-settings' },
  ]

  const nome = user?.name || user?.email || 'Redazione'
  const ruolo = user?.role ? STAFF_ROLE_LABELS[user.role] : ''

  return (
    <aside className="nav-esperia">
      <div className="nav-esperia__testata">
        <span className="nav-esperia__marchio">Esperia</span>
        <span className="nav-esperia__sottotitolo">Redazione</span>
      </div>

      <VociNav voci={voci} />

      <div className="nav-esperia__utente">
        <span className="nav-esperia__avatar" aria-hidden="true" />
        <span className="nav-esperia__dati">
          <span className="nav-esperia__nome">{nome}</span>
          {ruolo && <span className="nav-esperia__ruolo">{ruolo}</span>}
        </span>
      </div>
    </aside>
  )
}

export default NavLaterale
