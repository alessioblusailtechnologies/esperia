import type { AdminViewServerProps } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { roleAtLeast, type StaffRole } from '@esperia/shared'

import {
  commentiInAttesa,
  communityConfigurata,
  segnalazioniAperte,
  type VoceModerazione,
} from '@/lib/supabase'
import { CodaModerazione } from './CodaModerazione'

import './Moderazione.scss'

/**
 * Coda di moderazione della community — RF-B-10.
 *
 * È la vista che tiene insieme i due sistemi: i commenti vivono in Supabase
 * (schema `public`, protetto da RLS), gli articoli in Payload. Qui li
 * ricongiungiamo, perché un commento va giudicato sapendo su cosa sta.
 */

/**
 * Risolve i titoli degli articoli citati dalla coda.
 *
 * Una query sola per tutti gli id invece di una per commento: la coda può
 * contenere decine di voci sullo stesso pezzo.
 */
async function titoliArticoli(
  payload: AdminViewServerProps['initPageResult']['req']['payload'],
  ids: string[],
): Promise<Map<string, { titolo: string; slug: string; categoria: string }>> {
  const unici = [...new Set(ids)].filter(Boolean)
  if (unici.length === 0) return new Map()

  try {
    const res = await payload.find({
      collection: 'articles',
      where: { id: { in: unici } },
      limit: unici.length,
      depth: 1,
      overrideAccess: true,
    })

    return new Map(
      res.docs.map((d) => {
        const doc = d as unknown as {
          id: string
          title: string
          slug: string
          category?: { name?: string } | string | null
        }
        return [
          String(doc.id),
          {
            titolo: doc.title,
            slug: doc.slug,
            categoria:
              typeof doc.category === 'object' && doc.category ? (doc.category.name ?? '') : '',
          },
        ]
      }),
    )
  } catch {
    return new Map()
  }
}

function completa(
  voci: VoceModerazione[],
  titoli: Map<string, { titolo: string; slug: string; categoria: string }>,
): VoceModerazione[] {
  return voci.map((v) => {
    const a = titoli.get(v.articleId)
    return {
      ...v,
      articoloTitolo: a?.titolo ?? null,
      articoloSlug: a?.slug ?? null,
      articoloCategoria: a?.categoria ?? null,
    }
  })
}

async function ContenutoModerazione({ initPageResult }: AdminViewServerProps) {
  const { req } = initPageResult
  const utente = req.user as { role?: StaffRole } | undefined

  if (!roleAtLeast(utente?.role, 'editor')) {
    return (
      <div className="moderazione">
        <div className="moderazione__avviso">
          <h1>Sezione riservata</h1>
          <p>
            La moderazione della community è riservata a Editor e Amministratori. Se ritieni
            di doverne avere accesso, rivolgiti a un Amministratore.
          </p>
        </div>
      </div>
    )
  }

  if (!communityConfigurata()) {
    return (
      <div className="moderazione">
        <div className="moderazione__avviso">
          <h1>Community non configurata</h1>
          <p>
            Mancano le credenziali di Supabase (<code>SUPABASE_URL</code> e{' '}
            <code>SUPABASE_SERVICE_ROLE_KEY</code>). Finché non sono impostate la sezione
            community resta inattiva: il resto del backoffice funziona normalmente.
          </p>
        </div>
      </div>
    )
  }

  let inAttesa: VoceModerazione[] = []
  let segnalazioni: VoceModerazione[] = []
  let errore: string | null = null

  try {
    ;[inAttesa, segnalazioni] = await Promise.all([commentiInAttesa(), segnalazioniAperte()])

    const titoli = await titoliArticoli(req.payload, [
      ...inAttesa.map((v) => v.articleId),
      ...segnalazioni.map((v) => v.articleId),
    ])

    inAttesa = completa(inAttesa, titoli)
    segnalazioni = completa(segnalazioni, titoli)
  } catch (err) {
    errore = (err as Error).message
    req.payload.logger.error(`[moderazione] ${errore}`)
  }

  if (errore) {
    return (
      <div className="moderazione">
        <div className="moderazione__avviso">
          <h1>Coda non disponibile</h1>
          <p>
            Non è stato possibile leggere i commenti dalla community. Il resto del backoffice
            non è interessato: puoi continuare a lavorare sugli articoli.
          </p>
          <p className="moderazione__dettaglio">{errore}</p>
        </div>
      </div>
    )
  }

  return <CodaModerazione inAttesa={inAttesa} segnalazioni={segnalazioni} />
}

/**
 * Involucro con navigazione e barra superiore dell'admin.
 *
 * Payload monta le viste con path proprio FUORI dal template predefinito:
 * senza questo wrapper la schermata comparirebbe a tutta pagina, senza menu.
 */
export async function Moderazione(props: AdminViewServerProps) {
  const { initPageResult, params, searchParams } = props

  return (
    <DefaultTemplate
      i18n={initPageResult.req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={initPageResult.req.payload}
      permissions={initPageResult.permissions}
      req={initPageResult.req}
      searchParams={searchParams}
      user={initPageResult.req.user ?? undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <ContenutoModerazione {...props} />
    </DefaultTemplate>
  )
}

export default Moderazione
