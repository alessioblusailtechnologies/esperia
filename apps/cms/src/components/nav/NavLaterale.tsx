import { cookies, headers as intestazioni } from 'next/headers'
import type { Payload } from 'payload'
import { STAFF_ROLE_LABELS, type StaffRole } from '@esperia/shared'

import { contaModerazione } from '@/lib/supabase'
import { BarraLaterale, type GruppoNav, type BozzaInCorso, type SpesaAi } from './BarraLaterale'
import { COOKIE_NAV_COMPATTA } from './costanti'

import './NavLaterale.scss'

/**
 * Navigazione laterale del backoffice.
 *
 * Sostituisce la nav predefinita di Payload, che elenca le collection in ordine
 * di configurazione. Qui le voci seguono il lavoro redazionale, divise in
 * gruppi: la redazione in alto, struttura del sito e amministrazione chiuse
 * in fondo. Accanto alle voci compare solo quanto aspetta una decisione
 * (articoli da rivedere, argomenti nuovi, commenti in coda), mai un totale.
 *
 * Componente server: conteggi, bozze in lavorazione e spesa AI si leggono qui,
 * una volta per richiesta, invece di far partire fetch dal browser a ogni
 * cambio pagina.
 */

type Utente = {
  id?: string | number
  name?: string | null
  email?: string | null
  role?: StaffRole | null
} | null

type Props = {
  payload?: Payload
  user?: Utente
  visibleEntities?: { collections?: string[]; globals?: string[] }
}

/** Nessuna lettura deve poter far fallire la navigazione (RNF-10). */
async function sicuro<T>(fn: () => Promise<T>, ripiego: T): Promise<T> {
  try {
    return await fn()
  } catch {
    return ripiego
  }
}

async function conteggi(payload: Payload) {
  const [daRivedere, hotTopic, moderazione] = await Promise.all([
    sicuro(
      async () =>
        (
          await payload.count({
            collection: 'articles',
            where: { editorialStatus: { equals: 'in_revisione' } },
            overrideAccess: true,
          })
        ).totalDocs,
      0,
    ),
    sicuro(
      async () =>
        (
          await payload.count({
            collection: 'hot-topics',
            where: { status: { equals: 'nuovo' } },
            overrideAccess: true,
          })
        ).totalDocs,
      0,
    ),
    sicuro(async () => {
      const c = await contaModerazione()
      return c.inAttesa + c.segnalazioniAperte
    }, 0),
  ])
  return { daRivedere, hotTopic, moderazione }
}

/** Le bozze di chi sta usando il backoffice: si riaprono con un clic. */
async function bozzeInCorso(payload: Payload, utenteId: string | undefined): Promise<BozzaInCorso[]> {
  if (!utenteId) return []
  return sicuro(async () => {
    const res = await payload.find({
      collection: 'articles',
      where: {
        and: [
          { authors: { equals: utenteId } },
          { editorialStatus: { in: ['bozza', 'in_revisione'] } },
        ],
      },
      sort: '-updatedAt',
      limit: 5,
      depth: 0,
      overrideAccess: true,
      select: { title: true, editorialStatus: true },
    })
    return res.docs.map((d) => {
      const a = d as unknown as { id: string; title?: string; editorialStatus?: string }
      return {
        id: String(a.id),
        titolo: a.title || 'Senza titolo',
        stato: a.editorialStatus === 'in_revisione' ? 'in_revisione' : 'bozza',
      } as BozzaInCorso
    })
  }, [])
}

/** Quanto si è speso in AI nel mese, rispetto al tetto delle impostazioni. */
async function spesaAi(payload: Payload): Promise<SpesaAi | null> {
  return sicuro(async () => {
    const conf = (await payload.findGlobal({
      slug: 'ai-settings',
      overrideAccess: true,
      depth: 0,
    })) as unknown as { enabled?: boolean; monthlyBudgetEur?: number | null }
    if (!conf.enabled || !conf.monthlyBudgetEur) return null

    const inizioMese = new Date()
    inizioMese.setDate(1)
    inizioMese.setHours(0, 0, 0, 0)

    const righe = await payload.find({
      collection: 'ai-usage',
      where: { createdAt: { greater_than_equal: inizioMese.toISOString() } },
      pagination: false,
      depth: 0,
      overrideAccess: true,
      select: { estimatedCostEur: true },
    })
    const spesi = righe.docs.reduce(
      (tot, r) => tot + Number((r as { estimatedCostEur?: number }).estimatedCostEur ?? 0),
      0,
    )
    return { spesi, tetto: conf.monthlyBudgetEur }
  }, null)
}

/**
 * Chi sta usando il backoffice.
 *
 * Payload passa `user` fra le props quando monta la nav dalle proprie viste,
 * ma non lo fa attraverso DefaultTemplate nelle viste personalizzate: senza
 * questo ripiego il piede della colonna mostrerebbe un nome generico proprio
 * nelle schermate che abbiamo aggiunto noi.
 */
async function utenteCorrente(payload: Payload | undefined, daProps: Utente | undefined): Promise<Utente> {
  if (daProps?.id && (daProps.name || daProps.email)) return daProps
  if (!payload) return daProps ?? null
  try {
    const { user } = await payload.auth({ headers: await intestazioni() })
    return (user as Utente) ?? daProps ?? null
  } catch {
    return daProps ?? null
  }
}

export async function NavLaterale({ payload, user: userProp, visibleEntities }: Props) {
  const user = await utenteCorrente(payload, userProp)
  const utenteId = user?.id !== undefined ? String(user.id) : undefined

  const [n, bozze, spesa, biscotti] = await Promise.all([
    payload ? conteggi(payload) : Promise.resolve({ daRivedere: 0, hotTopic: 0, moderazione: 0 }),
    payload ? bozzeInCorso(payload, utenteId) : Promise.resolve([]),
    payload ? spesaAi(payload) : Promise.resolve(null),
    cookies(),
  ])

  // Le voci di collection e global seguono i permessi: chi non può aprire
  // Utenti o Impostazioni non deve vederle nel menu.
  const collezioni = visibleEntities?.collections
  const globali = visibleEntities?.globals
  const visibile = (v: { collezione?: string; globale?: string }) =>
    (!v.collezione || !collezioni || collezioni.includes(v.collezione)) &&
    (!v.globale || !globali || globali.includes(v.globale))

  const tutti: GruppoNav[] = [
    {
      titolo: 'Redazione',
      voci: [
        {
          etichetta: 'Articoli',
          href: '/admin/collections/articles',
          icona: 'articoli',
          collezione: 'articles',
          conteggio: n.daRivedere,
          suggerimento: 'da rivedere',
          evidenza: true,
        },
        {
          etichetta: 'Hot topic',
          href: '/admin/hot-topic',
          icona: 'fiamma',
          conteggio: n.hotTopic,
          suggerimento: 'argomenti nuovi',
        },
        { etichetta: 'Media', href: '/admin/collections/media', icona: 'immagine', collezione: 'media' },
      ],
    },
    {
      titolo: 'Community',
      voci: [
        {
          etichetta: 'Moderazione',
          href: '/admin/moderazione',
          icona: 'commenti',
          conteggio: n.moderazione,
          suggerimento: 'in attesa',
        },
      ],
    },
    {
      titolo: 'Struttura del sito',
      richiudibile: true,
      voci: [
        { etichetta: 'Categorie', href: '/admin/collections/categories', icona: 'cartella', collezione: 'categories' },
        { etichetta: 'Tag', href: '/admin/collections/tags', icona: 'tag', collezione: 'tags' },
        { etichetta: 'Pagine', href: '/admin/collections/pages', icona: 'pagina', collezione: 'pages' },
        { etichetta: 'Redirect', href: '/admin/collections/redirects', icona: 'rinvio', collezione: 'redirects' },
      ],
    },
    {
      titolo: 'Amministrazione',
      richiudibile: true,
      voci: [
        { etichetta: 'Fonti RSS', href: '/admin/collections/sources', icona: 'rss', collezione: 'sources' },
        { etichetta: 'Utenti e ruoli', href: '/admin/collections/users', icona: 'utenti', collezione: 'users' },
        { etichetta: 'AI: regole', href: '/admin/globals/ai-settings', icona: 'ai', globale: 'ai-settings' },
        { etichetta: 'AI: consumi', href: '/admin/collections/ai-usage', icona: 'ai', collezione: 'ai-usage' },
        { etichetta: 'Registro attività', href: '/admin/collections/audit-log', icona: 'registro', collezione: 'audit-log' },
        { etichetta: 'Impostazioni sito', href: '/admin/globals/site-settings', icona: 'regolazioni', globale: 'site-settings' },
      ],
    },
  ]
  const gruppi = tutti
    .map((g) => ({ ...g, voci: g.voci.filter(visibile) }))
    .filter((g) => g.voci.length > 0)

  return (
    <BarraLaterale
      gruppi={gruppi}
      bozze={bozze}
      spesa={spesa}
      compattaIniziale={biscotti.get(COOKIE_NAV_COMPATTA)?.value === '1'}
      utente={{
        nome: user?.name || user?.email || 'Redazione',
        ruolo: user?.role ? STAFF_ROLE_LABELS[user.role] : '',
      }}
    />
  )
}

export default NavLaterale
