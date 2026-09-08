import { sql } from '@payloadcms/db-postgres'
import type { Endpoint, PayloadRequest } from 'payload'

/**
 * Ricerca full-text sugli articoli pubblicati — RF-P-05.
 *
 * Endpoint dedicato invece di un filtro REST: la ricerca deve ordinare per
 * PERTINENZA, e la query REST di Payload sa solo filtrare e ordinare per
 * colonna. Qui usiamo l'indice tsvector italiano (supabase/migrations/
 * 0002_search_index.sql) con ts_rank pesato piu' un bonus di freschezza —
 * su un sito di notizie, a parita' di pertinenza vince l'articolo piu' recente.
 *
 * La risposta ha la stessa forma di una collection paginata di Payload, cosi'
 * il portale la consuma con lo stesso codice degli altri elenchi.
 */

const LIMITE_MAX = 50

interface RigaRisultato {
  id: string
  rank: number
  evidenza: string | null
}

/*
 * Delimitatori dell'evidenziazione — RF-P-05.
 *
 * ts_headline restituirebbe volentieri <mark> gia' pronti, ma il testo che
 * evidenzia arriva dagli articoli: se un redattore scrivesse "<script>" nel
 * corpo, quel markup finirebbe intatto nella pagina di ricerca (XSS stored,
 * RNF-03). Usiamo percio' due sequenze che nessuno digita, escapiamo tutto il
 * resto in JavaScript e solo alla fine le sostituiamo con i tag veri.
 */
const APRI = 'EVID'
const CHIUDI = 'EVID'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function evidenziaSicuro(grezzo: string | null): string | null {
  if (!grezzo) return null
  return escapeHtml(grezzo)
    .split(APRI)
    .join('<mark>')
    .split(CHIUDI)
    .join('</mark>')
}

export const searchEndpoint: Endpoint = {
  path: '/ricerca',
  method: 'get',
  handler: async (req: PayloadRequest) => {
    const params = req.searchParams
    const query = (params.get('q') ?? '').trim()
    const page = Math.max(1, Number(params.get('page') ?? '1') || 1)
    const limit = Math.min(LIMITE_MAX, Math.max(1, Number(params.get('limit') ?? '12') || 12))
    const offset = (page - 1) * limit

    const vuoto = {
      docs: [],
      totalDocs: 0,
      totalPages: 0,
      page: 1,
      limit,
      hasNextPage: false,
      hasPrevPage: false,
      nextPage: null,
      prevPage: null,
    }

    if (query.length < 2) return Response.json(vuoto)

    const db = req.payload.db as unknown as {
      drizzle: { execute: (q: unknown) => Promise<{ rows: unknown[] }> }
    }

    /*
     * websearch_to_tsquery interpreta la sintassi che gli utenti gia' conoscono
     * dai motori di ricerca: virgolette per la frase esatta, "or", il meno per
     * escludere. plainto_tsquery le ignorerebbe.
     */
    const conteggio = await db.drizzle.execute(sql`
      select count(*)::int as totale
        from ricerca.articoli i
       where i.is_published
         and i.published_at <= now()
         and i.search_vector @@ websearch_to_tsquery('public.italiano_unaccent', ${query})
    `)

    const totalDocs = Number((conteggio.rows[0] as { totale?: number })?.totale ?? 0)

    if (totalDocs === 0) return Response.json(vuoto)

    const risultati = await db.drizzle.execute(sql`
      select
          i.article_id as id,
          /*
           * Frammento attorno ai termini trovati, con i delimitatori neutri
           * che sostituiamo lato applicazione.
           *
           * La sorgente e' sommario + corpo, NON l'indice completo: partendo
           * da search_text il frammento comincerebbe ripetendo il titolo, che
           * il lettore ha gia' davanti una riga sopra. E quando i termini
           * compaiono solo nel titolo, ts_headline non trova nulla da
           * evidenziare e ripiega sull'inizio del testo: con il sommario in
           * testa quel ripiego e' una sintesi, non la prima frase a caso.
           */
          ts_headline(
            'public.italiano_unaccent',
            concat_ws(' ', a.excerpt, nullif(a.body_text, '')),
            websearch_to_tsquery('public.italiano_unaccent', ${query}),
            ${'StartSel=' + APRI + ', StopSel=' + CHIUDI + ', MaxWords=32, MinWords=16, MaxFragments=1, FragmentDelimiter= … '}
          ) as evidenza,
          ts_rank(
            i.search_vector,
            websearch_to_tsquery('public.italiano_unaccent', ${query})
          )
          -- Decadimento dolce sulla freschezza: dopo un anno un articolo vale
          -- circa la meta' di uno di oggi a parita' di pertinenza testuale.
          * (1 + 1.0 / (1 + extract(epoch from (now() - i.published_at)) / 31536000.0))
          as rank
        from ricerca.articoli i
        join payload.articles a on a.id = i.article_id
       where i.is_published
         and i.published_at <= now()
         and i.search_vector @@ websearch_to_tsquery('public.italiano_unaccent', ${query})
       order by rank desc, i.published_at desc
       limit ${limit}
      offset ${offset}
    `)

    const righe = risultati.rows as RigaRisultato[]
    const ids = righe.map((r) => r.id)

    if (ids.length === 0) return Response.json({ ...vuoto, totalDocs })

    // Il documento completo lo recupera Payload: cosi' access control, populate
    // delle relazioni e forma della risposta restano quelli di sempre.
    const documenti = await req.payload.find({
      collection: 'articles',
      where: { id: { in: ids } },
      depth: 1,
      limit: ids.length,
      req,
    })

    // `find` non conserva l'ordine di `in`: riordiniamo secondo il ranking e
    // agganciamo a ciascun documento il frammento evidenziato.
    const perId = new Map(documenti.docs.map((d) => [String(d.id), d]))
    const evidenzaPerId = new Map(righe.map((r) => [String(r.id), evidenziaSicuro(r.evidenza)]))

    const docs = ids
      .map((id) => {
        const doc = perId.get(String(id))
        if (!doc) return null
        return { ...doc, evidenza: evidenzaPerId.get(String(id)) ?? null }
      })
      .filter(Boolean)

    const totalPages = Math.ceil(totalDocs / limit)

    return Response.json({
      docs,
      totalDocs,
      totalPages,
      page,
      limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      nextPage: page < totalPages ? page + 1 : null,
      prevPage: page > 1 ? page - 1 : null,
    })
  },
}
