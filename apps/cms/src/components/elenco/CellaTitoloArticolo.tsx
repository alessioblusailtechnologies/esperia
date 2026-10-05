import { cache } from 'react'
import Link from 'next/link'
import type { Payload } from 'payload'

/**
 * Colonna «Titolo» dell'elenco articoli.
 *
 * Il titolo porta con sé sezione e firma su una seconda riga, come nel
 * prototipo: sono le due cose che si guardano subito dopo il titolo, e così
 * non servono due colonne in più. Sostituisce anche il «<No Titolo>» di
 * Payload con un «Senza titolo» leggibile.
 *
 * Componente server: nell'elenco sezione e firme arrivano come ID, perché
 * Payload popola solo le colonne visibili. Sezioni e redattori sono poche
 * decine: li leggiamo una volta per richiesta (cache di React) e risolviamo
 * i nomi da lì, invece di una query per riga.
 */

type Rif = { id?: string | number; name?: string | null; email?: string | null } | string | number | null

const nomiSezioni = cache(async (payload: Payload) => {
  const r = await payload.find({
    collection: 'categories',
    limit: 200,
    depth: 0,
    overrideAccess: true,
    select: { name: true },
  })
  return new Map(r.docs.map((d) => [String(d.id), (d as { name?: string }).name ?? '']))
})

const nomiRedattori = cache(async (payload: Payload) => {
  const r = await payload.find({
    collection: 'users',
    limit: 500,
    depth: 0,
    overrideAccess: true,
    select: { name: true, email: true },
  })
  return new Map(
    r.docs.map((d) => {
      const u = d as { name?: string | null; email?: string | null }
      return [String(d.id), u.name || u.email || '']
    }),
  )
})

function nome(rif: Rif, mappa: Map<string, string>): string | null {
  if (rif === null || rif === undefined) return null
  if (typeof rif === 'object') return rif.name || rif.email || mappa.get(String(rif.id)) || null
  return mappa.get(String(rif)) || null
}

export async function CellaTitoloArticolo({
  rowData,
  linkURL,
  payload,
}: {
  rowData?: Record<string, unknown>
  linkURL?: string
  payload?: Payload
}) {
  const titolo = typeof rowData?.title === 'string' && rowData.title.trim() ? rowData.title : null

  let meta = ''
  if (payload) {
    try {
      const [sezioni, redattori] = await Promise.all([nomiSezioni(payload), nomiRedattori(payload)])
      const sezione = nome(rowData?.category as Rif, sezioni)
      const firme = ((rowData?.authors as Rif[] | undefined) ?? [])
        .map((a) => nome(a, redattori))
        .filter(Boolean)
      meta = [sezione, firme.join(', ')].filter(Boolean).join(' · ')
    } catch {
      // Senza la seconda riga l'elenco resta utilizzabile.
    }
  }

  return (
    <Link
      href={linkURL ?? `/admin/collections/articles/${String(rowData?.id ?? '')}`}
      className="cella-titolo"
    >
      <span className={`cella-titolo__testo${titolo ? '' : ' cella-titolo__testo--vuoto'}`}>
        {titolo ?? 'Senza titolo'}
      </span>
      {meta && <span className="cella-titolo__meta">{meta}</span>}
    </Link>
  )
}

export default CellaTitoloArticolo
