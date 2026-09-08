import type { Endpoint, PayloadRequest } from 'payload'
import { slugify } from '@esperia/shared'
import { bozzaInLexical, generaBozza } from '@/lib/ai/genera'

/**
 * Genera una bozza d'articolo e la salva nel workflow — RF-AI-04, RF-AI-05, RF-AI-08.
 *
 * Due modalita':
 *   { hotTopicId: "..." }  a partire da un argomento individuato dal modulo AI
 *   { brief: "..." }       a partire da un brief libero del redattore
 *
 * L'articolo creato e' SEMPRE una bozza, attribuita a chi ha fatto la richiesta.
 * L'endpoint non ha alcun percorso che porti alla pubblicazione.
 */
export const generaBozzaEndpoint: Endpoint = {
  path: '/ai/genera-bozza',
  method: 'post',
  handler: async (req: PayloadRequest) => {
    if (!req.user) {
      return Response.json({ ok: false, messaggio: 'Autenticazione richiesta.' }, { status: 401 })
    }

    let corpo: { hotTopicId?: string; brief?: string; categoryId?: string }
    try {
      corpo = (await req.json?.()) ?? {}
    } catch {
      return Response.json({ ok: false, messaggio: 'Richiesta non valida.' }, { status: 400 })
    }

    const { hotTopicId, brief, categoryId } = corpo

    if (!hotTopicId && !brief) {
      return Response.json(
        { ok: false, messaggio: 'Indicare un hot topic oppure un brief.' },
        { status: 400 },
      )
    }

    /* --- Contesto della generazione ------------------------------------- */

    let contesto = brief ?? ''
    let fonti: Array<{ titolo: string; url: string; testata?: string }> = []
    let categoriaSuggerita = categoryId
    let hotTopic: Record<string, any> | null = null

    if (hotTopicId) {
      try {
        hotTopic = (await req.payload.findByID({
          collection: 'hot-topics',
          id: hotTopicId,
          depth: 1,
          req,
        })) as Record<string, any>
      } catch {
        return Response.json(
          { ok: false, messaggio: 'Hot topic non trovato.' },
          { status: 404 },
        )
      }

      contesto = [
        `Argomento: ${hotTopic.title}`,
        hotTopic.summary ? `\nSintesi delle fonti: ${hotTopic.summary}` : '',
        Array.isArray(hotTopic.keywords) && hotTopic.keywords.length
          ? `\nParole chiave ricorrenti: ${hotTopic.keywords.join(', ')}`
          : '',
        brief ? `\n\nIndicazioni del redattore: ${brief}` : '',
      ].join('')

      fonti = (hotTopic.references ?? []).map((r: Record<string, any>) => ({
        titolo: String(r.title ?? ''),
        url: String(r.url ?? ''),
        testata: r.publisher ? String(r.publisher) : undefined,
      }))

      categoriaSuggerita ??=
        typeof hotTopic.suggestedCategory === 'object'
          ? hotTopic.suggestedCategory?.id
          : hotTopic.suggestedCategory
    }

    /* --- Generazione ----------------------------------------------------- */

    const esito = await generaBozza(
      { payload: req.payload, utenteId: String(req.user.id) },
      { contesto, fonti },
      hotTopicId ? 'draft_from_topic' : 'draft_from_brief',
    )

    if (!esito.ok) {
      // 503 quando l'AI e' spenta o non configurata: e' una condizione di
      // servizio, non un errore del redattore (RNF-10).
      const stato =
        esito.motivo === 'disattivato' || esito.motivo === 'non_configurato' ? 503 : 502
      return Response.json({ ok: false, motivo: esito.motivo, messaggio: esito.messaggio }, {
        status: stato,
      })
    }

    const bozza = esito.dati

    /* --- Categoria: obbligatoria sull'articolo --------------------------- */

    if (!categoriaSuggerita) {
      const categorie = await req.payload.find({
        collection: 'categories',
        limit: 1,
        sort: 'order',
        req,
      })
      categoriaSuggerita = categorie.docs[0]?.id as string | undefined
    }

    if (!categoriaSuggerita) {
      return Response.json(
        {
          ok: false,
          messaggio: 'Nessuna categoria configurata: crearne almeno una prima di generare bozze.',
        },
        { status: 409 },
      )
    }

    /* --- Tag: riusiamo quelli esistenti, creiamo solo i mancanti ---------- */

    const idTag: string[] = []
    for (const nome of bozza.tagSuggeriti.slice(0, 6)) {
      const slug = slugify(nome)
      if (!slug) continue

      const esistente = await req.payload.find({
        collection: 'tags',
        where: { slug: { equals: slug } },
        limit: 1,
        req,
      })

      if (esistente.docs[0]) {
        idTag.push(String(esistente.docs[0].id))
        continue
      }

      const creato = await req.payload.create({
        collection: 'tags',
        data: { name: nome, slug },
        req,
      })
      idTag.push(String(creato.id))
    }

    /* --- Creazione della bozza ------------------------------------------- */

    const config = await req.payload.findGlobal({ slug: 'ai-settings', overrideAccess: true })

    const articolo = await req.payload.create({
      collection: 'articles',
      req, // conserva l'utente: l'hook enforceWorkflow lo usa per la firma
      draft: true,
      data: {
        title: bozza.titolo,
        kicker: bozza.occhiello,
        excerpt: bozza.sommario,
        slug: slugify(bozza.titolo),
        content: bozzaInLexical(bozza.paragrafi),
        category: categoriaSuggerita,
        tags: idTag,
        authors: [req.user.id],
        editorialStatus: 'bozza',
        _status: 'draft',
        seo: { metaDescription: bozza.metaDescription },
        ai: {
          origin: hotTopicId ? 'hot_topic' : 'brief',
          hotTopic: hotTopicId ?? undefined,
          model: (config as Record<string, any>).textModel,
          generatedAt: new Date().toISOString(),
          brief: brief ?? undefined,
          humanReviewed: false,
        },
      },
    })

    // L'hot topic passa a "convertito" e punta all'articolo: cosi' non viene
    // riproposto e resta tracciabile da dove nasce il pezzo (RF-AI-11).
    if (hotTopicId) {
      await req.payload.update({
        collection: 'hot-topics',
        id: hotTopicId,
        req,
        data: { status: 'convertito', generatedArticle: articolo.id },
      })
    }

    return Response.json({
      ok: true,
      articoloId: articolo.id,
      urlModifica: `/admin/collections/articles/${articolo.id}`,
      // Restituiti a parte: sono suggerimenti su cui il redattore decide,
      // non contenuto gia' inserito nell'articolo.
      titoliAlternativi: bozza.titoliAlternativi,
      puntiDaVerificare: bozza.puntiDaVerificare,
    })
  },
}
