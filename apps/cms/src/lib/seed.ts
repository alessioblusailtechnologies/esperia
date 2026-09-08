import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import { bozzaInLexical } from './ai/genera'

/**
 * Popolamento iniziale del database.
 *
 * Serve a due cose: dare a un ambiente appena creato il minimo indispensabile
 * per essere usabile (un amministratore, le categorie, le pagine legali di
 * servizio), e verificare che il workflow editoriale si comporti davvero come
 * descritto in RF-B-05 — l'ultimo passo del seed prova a pubblicare un
 * articolo non approvato e si aspetta che venga rifiutato.
 *
 *   pnpm --filter @esperia/cms seed
 *
 * E' idempotente: rieseguirlo non duplica nulla.
 */

const CATEGORIE = [
  { name: 'Cronaca', slug: 'cronaca', order: 10, color: '#B3261E' },
  { name: 'Politica', slug: 'politica', order: 20, color: '#1B4D8F' },
  { name: 'Economia', slug: 'economia', order: 30, color: '#1B5E20' },
  { name: 'Cultura', slug: 'cultura', order: 40, color: '#6A1B9A' },
  { name: 'Sport', slug: 'sport', order: 50, color: '#E65100' },
]

const PAGINE = [
  { title: 'Chi siamo', slug: 'chi-siamo', ordine: 10 },
  { title: 'Contatti', slug: 'contatti', ordine: 20 },
  { title: 'Privacy policy', slug: 'privacy-policy', ordine: 30 },
  { title: 'Cookie policy', slug: 'cookie-policy', ordine: 40 },
]

async function main() {
  const payload = await getPayload({ config })
  const log = (m: string) => payload.logger.info(`[seed] ${m}`)

  /* --- Amministratore ---------------------------------------------------- */

  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@esperia.local'
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'esperia-cambiami-subito'

  const esistenti = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    overrideAccess: true,
  })

  let admin = esistenti.docs[0]
  if (!admin) {
    admin = await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: { email, password, name: 'Amministratore', role: 'admin', active: true },
    })
    log(`amministratore creato: ${email}`)
  } else {
    log('amministratore gia presente')
  }

  /* --- Categorie --------------------------------------------------------- */

  const idCategorie: Record<string, string> = {}
  for (const c of CATEGORIE) {
    const trovata = await payload.find({
      collection: 'categories',
      where: { slug: { equals: c.slug } },
      limit: 1,
      overrideAccess: true,
    })

    const doc =
      trovata.docs[0] ??
      (await payload.create({ collection: 'categories', overrideAccess: true, data: c }))

    idCategorie[c.slug] = String(doc.id)
  }
  log(`categorie: ${Object.keys(idCategorie).length}`)

  /* --- Pagine di servizio ------------------------------------------------ */

  const idPagine: Record<string, string> = {}
  for (const p of PAGINE) {
    const trovata = await payload.find({
      collection: 'pages',
      where: { slug: { equals: p.slug } },
      limit: 1,
      overrideAccess: true,
    })

    const doc =
      trovata.docs[0] ??
      (await payload.create({
        collection: 'pages',
        overrideAccess: true,
        data: {
          title: p.title,
          slug: p.slug,
          showInFooter: true,
          footerOrder: p.ordine,
          _status: 'published',
          content: bozzaInLexical([
            `Contenuto della pagina "${p.title}" da sostituire con il testo fornito dal Committente.`,
          ]) as never,
        },
      }))

    idPagine[p.slug] = String(doc.id)
  }
  log(`pagine di servizio: ${Object.keys(idPagine).length}`)

  /* --- Impostazioni del portale ------------------------------------------ */

  await payload.updateGlobal({
    slug: 'site-settings',
    overrideAccess: true,
    data: {
      siteName: 'Esperia',
      tagline: 'Notizie, approfondimenti, community',
      publisherName: 'Esperia S.r.l.',
      cookieBanner: {
        enabled: true,
        privacyPage: idPagine['privacy-policy'],
        cookiePage: idPagine['cookie-policy'],
      },
      analytics: { provider: 'nessuno' },
    } as never,
  })
  log('impostazioni portale aggiornate')

  /* --- Verifica del workflow editoriale (RF-B-05) ------------------------- */

  const bozzaEsistente = await payload.find({
    collection: 'articles',
    where: { slug: { equals: 'articolo-di-esempio' } },
    limit: 1,
    overrideAccess: true,
  })

  if (!bozzaEsistente.docs[0]) {
    const articolo = await payload.create({
      collection: 'articles',
      overrideAccess: true,
      draft: true,
      data: {
        title: 'Articolo di esempio',
        slug: 'articolo-di-esempio',
        kicker: 'Verifica',
        excerpt: 'Articolo creato dal seed per verificare il workflow editoriale.',
        category: idCategorie['cronaca'],
        authors: [admin.id],
        editorialStatus: 'bozza',
        _status: 'draft',
        content: bozzaInLexical([
          'Questo articolo viene creato dallo script di popolamento iniziale.',
          'Serve a verificare che il ciclo bozza, revisione, approvazione e pubblicazione funzioni.',
        ]) as never,
      } as never,
    })
    log('bozza di esempio creata')

    // Il gate del workflow: pubblicare senza approvazione deve fallire.
    let rifiutata = false
    try {
      await payload.update({
        collection: 'articles',
        id: articolo.id,
        overrideAccess: false,
        user: admin,
        data: { _status: 'published' } as never,
      })
    } catch (err) {
      rifiutata = true
      log(`workflow OK — pubblicazione senza approvazione rifiutata: ${(err as Error).message}`)
    }

    if (!rifiutata) {
      throw new Error(
        'ATTESO FALLIMENTO: un articolo non approvato e stato pubblicato. Il gate RF-B-05 non funziona.',
      )
    }

    // Percorso corretto: approvazione, poi pubblicazione.
    await payload.update({
      collection: 'articles',
      id: articolo.id,
      overrideAccess: false,
      user: admin,
      data: { editorialStatus: 'in_revisione' } as never,
    })
    await payload.update({
      collection: 'articles',
      id: articolo.id,
      overrideAccess: false,
      user: admin,
      data: { editorialStatus: 'approvato' } as never,
    })
    await payload.update({
      collection: 'articles',
      id: articolo.id,
      overrideAccess: false,
      user: admin,
      data: { _status: 'published' } as never,
    })
    log('workflow OK — articolo approvato e pubblicato')
  } else {
    log('articolo di esempio gia presente')
  }

  log('completato')
  process.exit(0)
}

main().catch((err) => {
  console.error('[seed] errore:', err)
  process.exit(1)
})
