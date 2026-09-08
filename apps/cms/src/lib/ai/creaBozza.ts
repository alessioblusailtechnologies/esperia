import type { Payload } from 'payload'
import { slugify } from '@esperia/shared'

import { bozzaInLexical, type BozzaGenerata } from './genera'

/**
 * Crea l'articolo in bozza a partire da una proposta dell'assistente —
 * RF-AI-04, RF-AI-05, RF-AI-08.
 *
 * Estratto in una funzione sola perche' ci arrivano due strade — l'endpoint
 * REST e le azioni del backoffice — e il vincolo "sempre e solo bozza" deve
 * valere per entrambe senza doverlo riscrivere.
 *
 * La proposta passata puo' essere stata MODIFICATA dal redattore prima di
 * arrivare qui: e' il punto di RF-AI-08, il testo che si salva e' quello che
 * una persona ha accettato, non quello che il modello ha prodotto.
 */

export interface OpzioniCreazione {
  payload: Payload
  utenteId: string
  proposta: BozzaGenerata
  categoriaId?: string | null
  hotTopicId?: string | null
  /** Brief originale, conservato per tracciabilita' (RF-AI-11). */
  brief?: string | null
  modello?: string | null
}

export interface EsitoCreazione {
  articoloId: string
  urlModifica: string
}

/** Riusa i tag esistenti e crea solo quelli mancanti, per non moltiplicare sinonimi. */
async function risolviTag(payload: Payload, nomi: string[]): Promise<string[]> {
  const ids: string[] = []

  for (const nome of nomi.slice(0, 6)) {
    const slug = slugify(nome)
    if (!slug) continue

    const esistente = await payload.find({
      collection: 'tags',
      where: { slug: { equals: slug } },
      limit: 1,
      overrideAccess: true,
    })

    if (esistente.docs[0]) {
      ids.push(String(esistente.docs[0].id))
      continue
    }

    const creato = await payload.create({
      collection: 'tags',
      data: { name: nome, slug },
      overrideAccess: true,
    })
    ids.push(String(creato.id))
  }

  return ids
}

async function categoriaPredefinita(payload: Payload): Promise<string | null> {
  const res = await payload.find({
    collection: 'categories',
    limit: 1,
    sort: 'order',
    overrideAccess: true,
  })
  return res.docs[0] ? String(res.docs[0].id) : null
}

/** Uno slug libero: se esiste gia', accodiamo un progressivo. */
async function slugLibero(payload: Payload, titolo: string): Promise<string> {
  const base = slugify(titolo) || 'bozza'

  for (let n = 0; n < 20; n++) {
    const candidato = n === 0 ? base : `${base}-${n + 1}`.slice(0, 75)
    const esistente = await payload.find({
      collection: 'articles',
      where: { slug: { equals: candidato } },
      limit: 1,
      overrideAccess: true,
    })
    if (esistente.docs.length === 0) return candidato
  }

  return `${base}-${Date.now()}`.slice(0, 75)
}

export async function creaBozzaDaProposta(
  o: OpzioniCreazione,
): Promise<{ ok: true; dati: EsitoCreazione } | { ok: false; messaggio: string }> {
  const { payload, proposta } = o

  const categoria = o.categoriaId ?? (await categoriaPredefinita(payload))
  if (!categoria) {
    return {
      ok: false,
      messaggio: 'Nessuna categoria configurata: crearne almeno una prima di generare bozze.',
    }
  }

  const utente = await payload.findByID({
    collection: 'users',
    id: o.utenteId,
    overrideAccess: true,
  })

  const tags = await risolviTag(payload, proposta.tagSuggeriti ?? [])
  const slug = await slugLibero(payload, proposta.titolo)

  const articolo = await payload.create({
    collection: 'articles',
    draft: true,
    // `user` invece di `overrideAccess`: l'hook enforceWorkflow deve vedere chi
    // sta creando, sia per la firma sia per forzare lo stato bozza (RF-AI-08).
    user: utente,
    overrideAccess: false,
    data: {
      title: proposta.titolo,
      kicker: proposta.occhiello,
      excerpt: proposta.sommario,
      slug,
      content: bozzaInLexical(proposta.paragrafi),
      category: categoria,
      tags,
      authors: [o.utenteId],
      editorialStatus: 'bozza',
      _status: 'draft',
      seo: { metaDescription: proposta.metaDescription },
      ai: {
        origin: o.hotTopicId ? 'hot_topic' : 'brief',
        hotTopic: o.hotTopicId ?? undefined,
        model: o.modello ?? undefined,
        generatedAt: new Date().toISOString(),
        brief: o.brief ?? undefined,
        humanReviewed: false,
      },
    } as never,
  })

  // L'hot topic passa a "convertito" e punta all'articolo: cosi' non viene
  // riproposto e resta tracciabile da dove nasce il pezzo (RF-AI-11).
  if (o.hotTopicId) {
    try {
      await payload.update({
        collection: 'hot-topics',
        id: o.hotTopicId,
        overrideAccess: true,
        data: { status: 'convertito', generatedArticle: articolo.id } as never,
      })
    } catch (err) {
      payload.logger.error(
        `Aggiornamento hot topic ${o.hotTopicId} fallito: ${(err as Error).message}`,
      )
    }
  }

  return {
    ok: true,
    dati: {
      articoloId: String(articolo.id),
      urlModifica: `/admin/collections/articles/${articolo.id}`,
    },
  }
}
