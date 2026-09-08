import { sql } from '@payloadcms/db-postgres'
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, Payload } from 'payload'

/**
 * Mantiene allineato l'indice di ricerca — RF-P-05.
 *
 * L'indice vive nello schema `ricerca`, fuori da quello gestito da Payload:
 * una colonna aggiunta a payload.articles verrebbe rimossa dalla
 * sincronizzazione automatica dello schema in sviluppo. La conseguenza e' che
 * l'allineamento tocca a noi, ed e' questo hook a farlo.
 *
 * Non deve mai far fallire un salvataggio: se l'indice non si aggiorna,
 * l'articolo resta comunque pubblicato e la ricerca lo ritrova alla prima
 * ricostruzione (`select ricerca.ricostruisci();`).
 */

type Drizzle = { drizzle: { execute: (q: unknown) => Promise<unknown> } }

function db(payload: Payload): Drizzle['drizzle'] {
  return (payload.db as unknown as Drizzle).drizzle
}

export const indicizzaArticolo: CollectionAfterChangeHook = async ({ doc, req }) => {
  try {
    await db(req.payload).execute(sql`
      select ricerca.aggiorna_articolo(
        ${doc.id}::uuid,
        ${doc.title ?? ''},
        ${doc.kicker ?? ''},
        ${doc.subtitle ?? ''},
        ${doc.excerpt ?? ''},
        ${doc.searchText ?? ''},
        ${doc._status === 'published'},
        ${doc.publishedAt ?? null}
      )
    `)
  } catch (err) {
    req.payload.logger.error(
      `Aggiornamento indice di ricerca fallito per "${doc.slug}": ${(err as Error).message}. ` +
        'Eseguire "select ricerca.ricostruisci();" per riallineare.',
    )
  }

  return doc
}

export const rimuoviDaIndice: CollectionAfterDeleteHook = async ({ doc, req }) => {
  try {
    await db(req.payload).execute(sql`
      delete from ricerca.articoli where article_id = ${doc.id}::uuid
    `)
  } catch (err) {
    req.payload.logger.error(
      `Rimozione dall'indice di ricerca fallita: ${(err as Error).message}`,
    )
  }
  return doc
}
