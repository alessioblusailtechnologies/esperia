import 'dotenv/config'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getPayload } from 'payload'
import config from '../payload.config'
import { bozzaInLexical } from './ai/genera'

/**
 * Contenuti dimostrativi.
 *
 * Separato dal seed di produzione di proposito: quello prepara un ambiente
 * vuoto ma utilizzabile, questo lo riempie di articoli finti. Non va mai
 * eseguito su un ambiente del Committente.
 *
 *   pnpm --filter @esperia/cms seed:demo
 */

const dirname = path.dirname(fileURLToPath(import.meta.url))

/** Immagini di esempio fornite con i design, se presenti. */
const CARTELLA_IMMAGINI = path.resolve(dirname, '../../../../Design portale Esperia/uploads')

interface Bozza {
  titolo: string
  occhiello?: string
  sottotitolo?: string
  sommario: string
  categoria: string
  tag: string[]
  paragrafi: string[]
  inEvidenza?: boolean
  oreFa: number
}

const ARTICOLI: Bozza[] = [
  {
    titolo: 'Manovra, il governo trova l’intesa sul taglio dell’Irpef per il ceto medio',
    occhiello: 'Manovra 2027',
    sottotitolo:
      'Seconda aliquota al 33% fino a 60 mila euro, coperture da banche e assicurazioni. Le opposizioni annunciano battaglia in commissione Bilancio.',
    sommario:
      'Accordo raggiunto nella notte a Palazzo Chigi: seconda aliquota al 33% fino a 60 mila euro, coperture dalle banche e dalla revisione delle detrazioni.',
    categoria: 'politica',
    tag: ['Manovra 2027', 'Fisco', 'Palazzo Chigi'],
    inEvidenza: true,
    oreFa: 3,
    paragrafi: [
      'L’intesa è arrivata poco dopo le due di notte, dopo sei ore di riunione a Palazzo Chigi. Il taglio della seconda aliquota Irpef dal 35 al 33 per cento salirà fino a 60 mila euro di reddito, un perimetro più ampio di quello discusso nella bozza tecnica di lunedì.',
      'Il costo dell’intervento è stimato in 4,2 miliardi per il primo anno. Le coperture, secondo la nota diffusa dal Mef, arriveranno per metà dal contributo di banche e assicurazioni e per il resto dalla revisione delle detrazioni sopra i 120 mila euro.',
      'Il contributo del settore creditizio resta la parte più fragile del quadro. L’Abi ha chiesto garanzie sulla natura temporanea del prelievo, mentre il viceministro all’Economia parla di un accordo già scritto nei numeri.',
      'Nel testo entrano anche due misure attese dagli enti locali: la proroga del fondo per le aree interne e il rifinanziamento del trasporto pubblico regionale, quest’ultimo con una dotazione ridotta rispetto al 2026.',
      'L’esame parlamentare partirà martedì. Le opposizioni hanno già annunciato oltre milleduecento emendamenti, concentrati su sanità e contratti pubblici; la maggioranza punta all’approvazione entro il 20 dicembre.',
      'Resta aperta la partita sulle pensioni, rinviata a un tavolo tecnico che si riunirà la prossima settimana.',
    ],
  },
  {
    titolo: 'Vertice UE sui dazi: Roma chiede una clausola di salvaguardia per l’agroalimentare',
    sommario:
      'Il tavolo di Bruxelles slitta a settembre. Confagricoltura stima 400 milioni di export a rischio.',
    categoria: 'mondo',
    tag: ['Unione Europea', 'Dazi'],
    inEvidenza: true,
    oreFa: 5,
    paragrafi: [
      'Il tavolo tecnico convocato a Bruxelles si è chiuso senza un mandato negoziale. La delegazione italiana ha chiesto una clausola di salvaguardia per i prodotti a denominazione protetta, sostenuta da Spagna e Grecia.',
      'Secondo le stime di Confagricoltura l’esposizione del comparto vale circa 400 milioni di euro di export annuo, concentrati su formaggi stagionati, vino e conserve.',
      'La Commissione ha rinviato ogni decisione alla riunione di settembre, quando sarà disponibile la valutazione d’impatto commissionata a maggio.',
    ],
  },
  {
    titolo: 'Alta velocità Salerno-Reggio, il cronoprogramma slitta di due anni',
    sommario:
      'La relazione della Corte dei conti sui lotti calabresi: appalti fermi e costi rivisti del 12%.',
    categoria: 'economia',
    tag: ['Infrastrutture', 'Mezzogiorno'],
    inEvidenza: true,
    oreFa: 7,
    paragrafi: [
      'La relazione depositata dalla Corte dei conti fotografa uno scostamento di ventiquattro mesi sul cronoprogramma dei lotti calabresi, con una revisione dei costi del 12 per cento rispetto al quadro economico del 2024.',
      'Due appalti risultano sospesi in attesa della verifica antimafia sulle imprese subappaltatrici; un terzo è stato riaggiudicato a marzo dopo il ricorso della seconda classificata.',
      'Il commissario di governo ha annunciato una revisione del piano entro ottobre, con l’obiettivo di recuperare almeno dodici mesi sui lotti già cantierati.',
    ],
  },
  {
    titolo: 'Musei statali, ingressi in crescita del 9%: il sorpasso di Pompei su Firenze',
    sommario:
      'I dati del ministero sul primo semestre. Cresce il pubblico under 25, calano le scolastiche.',
    categoria: 'cultura',
    tag: ['Musei', 'Turismo'],
    oreFa: 20,
    paragrafi: [
      'Il primo semestre chiude con 32 milioni di ingressi nei musei e nei parchi archeologici statali, in crescita del 9 per cento rispetto allo stesso periodo del 2025.',
      'Il parco archeologico di Pompei supera per la prima volta il polo museale fiorentino, trainato dall’apertura serale estiva e dal nuovo percorso sulla Villa dei Misteri.',
      'Cresce di quattro punti la quota di visitatori sotto i venticinque anni, mentre calano le visite scolastiche: il ministero attribuisce il dato al taglio dei fondi per i trasporti delle scuole.',
    ],
  },
  {
    titolo: 'Consiglio dei ministri convocato per giovedì: sul tavolo il decreto Aree interne',
    sommario: 'Il provvedimento contiene la proroga del fondo e il rifinanziamento dei servizi.',
    categoria: 'politica',
    tag: ['Aree interne', 'Governo'],
    oreFa: 9,
    paragrafi: [
      'Il Consiglio dei ministri è stato convocato per giovedì mattina. All’ordine del giorno il decreto sulle aree interne, atteso dai sindaci dei piccoli comuni da oltre un anno.',
      'Il testo proroga di dodici mesi il fondo di coesione territoriale e introduce un meccanismo di premialità per i comuni che associano i servizi.',
    ],
  },
  {
    titolo: 'Istat: inflazione ferma all’1,8% ad agosto, rallenta il carrello della spesa',
    sommario: 'Il dato provvisorio conferma le attese. Frena il comparto alimentare.',
    categoria: 'economia',
    tag: ['Inflazione', 'Istat'],
    oreFa: 10,
    paragrafi: [
      'L’indice nazionale dei prezzi al consumo si è attestato all’1,8 per cento su base annua, in linea con il mese precedente e con le attese degli analisti.',
      'Il cosiddetto carrello della spesa rallenta all’1,2 per cento, il valore più basso da diciotto mesi. Restano in tensione i servizi ricettivi, che risentono della stagione turistica.',
    ],
  },
  {
    titolo: 'Maltempo in Liguria, allerta arancione sul levante: scuole chiuse a Chiavari',
    sommario: 'La protezione civile ha esteso l’allerta fino alla mezzanotte di domani.',
    categoria: 'cronaca',
    tag: ['Maltempo', 'Liguria'],
    oreFa: 11,
    paragrafi: [
      'L’allerta arancione riguarda il levante ligure e i bacini padani di ponente. La protezione civile regionale ha esteso l’avviso fino alla mezzanotte di domani.',
      'I comuni di Chiavari, Lavagna e Sestri Levante hanno disposto la chiusura delle scuole di ogni ordine e grado.',
    ],
  },
  {
    titolo: 'Tregua in Sudan, l’inviato ONU: «Corridoi umanitari aperti entro settantadue ore»',
    sommario: 'L’intesa riguarda il Darfur settentrionale. Restano esclusi i valichi orientali.',
    categoria: 'mondo',
    tag: ['Sudan', 'ONU'],
    oreFa: 12,
    paragrafi: [
      'L’intesa raggiunta a Gedda prevede l’apertura di tre corridoi umanitari nel Darfur settentrionale entro settantadue ore.',
      'Restano esclusi dall’accordo i valichi orientali, dove i combattimenti sono proseguiti anche nelle ultime quarantotto ore.',
    ],
  },
  {
    titolo: 'Regionali, il campo largo tratta in Veneto: vertice a Roma tra i segretari',
    sommario: 'Sul tavolo il nome del candidato e il perimetro della coalizione.',
    categoria: 'politica',
    tag: ['Regionali', 'Veneto'],
    oreFa: 13,
    paragrafi: [
      'Il vertice romano tra i segretari si è chiuso senza un nome, ma con l’impegno a chiudere la partita entro la fine del mese.',
      'Il nodo resta il perimetro della coalizione: due delle liste minori chiedono garanzie sul programma sanitario prima di aderire.',
    ],
  },
  {
    titolo: 'Stellantis rinvia il piano Mirafiori: incontro al Mimit con i sindacati',
    sommario: 'La produzione del nuovo modello slitta al secondo trimestre.',
    categoria: 'economia',
    tag: ['Stellantis', 'Lavoro'],
    oreFa: 14,
    paragrafi: [
      'Il gruppo ha comunicato ai sindacati lo slittamento al secondo trimestre dell’avvio produttivo del nuovo modello previsto a Mirafiori.',
      'L’incontro al ministero delle Imprese è convocato per la prossima settimana; le organizzazioni sindacali chiedono garanzie sugli ammortizzatori.',
    ],
  },
  {
    titolo: 'Venezia 83, standing ovation per il film sul processo di Palermo',
    sommario: 'Otto minuti di applausi in sala grande. Il regista: «Non è un film di parte».',
    categoria: 'cultura',
    tag: ['Cinema', 'Venezia'],
    oreFa: 16,
    paragrafi: [
      'Otto minuti di applausi hanno accolto la proiezione in sala grande. Il film ricostruisce le tre fasi del processo attraverso gli atti e le testimonianze dirette.',
      'Il regista ha respinto le critiche arrivate nei giorni scorsi: «Non è un film di parte, è un film di documenti».',
    ],
  },
]

async function main() {
  const payload = await getPayload({ config })
  const log = (m: string) => payload.logger.info(`[demo] ${m}`)

  /* --- Immagini ---------------------------------------------------------- */

  const immagini: string[] = []
  if (fs.existsSync(CARTELLA_IMMAGINI)) {
    const file = fs
      .readdirSync(CARTELLA_IMMAGINI)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))

    for (const nome of file) {
      const esistente = await payload.find({
        collection: 'media',
        where: { filename: { equals: nome } },
        limit: 1,
        overrideAccess: true,
      })

      if (esistente.docs[0]) {
        immagini.push(String(esistente.docs[0].id))
        continue
      }

      const doc = await payload.create({
        collection: 'media',
        overrideAccess: true,
        filePath: path.join(CARTELLA_IMMAGINI, nome),
        data: {
          alt: `Immagine di esempio: ${nome.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')}`,
          credit: 'Immagine dimostrativa',
        },
      })
      immagini.push(String(doc.id))
    }
    log(`immagini disponibili: ${immagini.length}`)
  } else {
    log('cartella immagini di esempio non trovata: gli articoli resteranno senza copertina')
  }

  /* --- Categorie e tag ---------------------------------------------------- */

  const categorie = await payload.find({ collection: 'categories', limit: 100, overrideAccess: true })
  const idCategoria = new Map(categorie.docs.map((c) => [String(c.slug), String(c.id)]))

  // La categoria "Mondo" non è nel seed di base: la creiamo se manca.
  if (!idCategoria.has('mondo')) {
    const c = await payload.create({
      collection: 'categories',
      overrideAccess: true,
      data: { name: 'Mondo', slug: 'mondo', order: 15, color: '#1B4D8F' },
    })
    idCategoria.set('mondo', String(c.id))
  }

  async function idTag(nome: string): Promise<string> {
    const slug = nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    const trovato = await payload.find({
      collection: 'tags',
      where: { slug: { equals: slug } },
      limit: 1,
      overrideAccess: true,
    })
    if (trovato.docs[0]) return String(trovato.docs[0].id)

    const creato = await payload.create({
      collection: 'tags',
      overrideAccess: true,
      data: { name: nome, slug },
    })
    return String(creato.id)
  }

  /* --- Redattori ---------------------------------------------------------- */

  const FIRME = [
    { name: 'Emanuele Ragusa', email: 'e.ragusa@esperia.local', bio: 'Segue la politica economica e il Parlamento.' },
    { name: 'Elena Costa', email: 'e.costa@esperia.local', bio: 'Si occupa di economia, lavoro e infrastrutture.' },
    { name: 'Luca Ferraro', email: 'l.ferraro@esperia.local', bio: 'Cronaca e territori.' },
  ]

  const idFirme: string[] = []
  for (const f of FIRME) {
    const trovato = await payload.find({
      collection: 'users',
      where: { email: { equals: f.email } },
      limit: 1,
      overrideAccess: true,
    })
    const doc =
      trovato.docs[0] ??
      (await payload.create({
        collection: 'users',
        overrideAccess: true,
        data: { ...f, password: 'esperia-demo-0001', role: 'editor', active: true },
      }))
    idFirme.push(String(doc.id))
  }

  /* --- Articoli ----------------------------------------------------------- */

  const editor = await payload.findByID({
    collection: 'users',
    id: idFirme[0]!,
    overrideAccess: true,
  })

  let creati = 0
  for (const [i, b] of ARTICOLI.entries()) {
    const slug = b.titolo
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 75)
      .replace(/-+$/g, '')

    const esistente = await payload.find({
      collection: 'articles',
      where: { slug: { equals: slug } },
      limit: 1,
      overrideAccess: true,
    })
    if (esistente.docs[0]) continue

    const categoria = idCategoria.get(b.categoria)
    if (!categoria) continue

    const tags = await Promise.all(b.tag.map(idTag))
    const pubblicatoIl = new Date(Date.now() - b.oreFa * 3600_000).toISOString()

    const articolo = await payload.create({
      collection: 'articles',
      overrideAccess: true,
      draft: true,
      data: {
        title: b.titolo,
        slug,
        kicker: b.occhiello,
        subtitle: b.sottotitolo,
        excerpt: b.sommario,
        category: categoria,
        tags,
        authors: [idFirme[i % idFirme.length]!],
        heroImage: immagini.length ? immagini[i % immagini.length] : undefined,
        featured: Boolean(b.inEvidenza),
        editorialStatus: 'bozza',
        _status: 'draft',
        content: bozzaInLexical(b.paragrafi) as never,
      } as never,
    })

    // Percorso completo del workflow, come lo farebbe la redazione.
    for (const stato of ['in_revisione', 'approvato'] as const) {
      await payload.update({
        collection: 'articles',
        id: articolo.id,
        overrideAccess: false,
        user: editor,
        data: { editorialStatus: stato } as never,
      })
    }
    await payload.update({
      collection: 'articles',
      id: articolo.id,
      overrideAccess: false,
      user: editor,
      data: { _status: 'published', publishedAt: pubblicatoIl } as never,
    })

    creati++
  }

  log(`articoli pubblicati: ${creati}`)

  /* --- Hot topic dimostrativi --------------------------------------------- */

  const TOPICS = [
    {
      title: 'Contributo delle banche sulla manovra: il nodo della temporaneità',
      summary:
        'Cinque agenzie riportano la richiesta dell’Abi di garanzie scritte sulla durata del prelievo. Il Mef non conferma. Tema ricorrente nelle ultime 48 ore.',
      score: 82,
      keywords: ['abi', 'manovra', 'banche', 'prelievo'],
      categoria: 'economia',
      oreFa: 2,
      fonti: [
        { title: 'Abi chiede garanzie sul contributo', url: 'https://esempio.it/abi-garanzie', publisher: 'Agenzia Nova' },
        { title: 'Mef: nessuna conferma sulla durata', url: 'https://esempio.it/mef-durata', publisher: 'Radiocor' },
        { title: 'Il nodo del prelievo bancario', url: 'https://esempio.it/prelievo', publisher: 'Ansa' },
      ],
    },
    {
      title: 'Aree interne, i sindaci chiedono una proroga triennale del fondo',
      summary:
        'Anci diffonde una nota con 320 comuni firmatari. Il decreto in Consiglio dei ministri prevede dodici mesi.',
      score: 64,
      keywords: ['aree interne', 'anci', 'comuni'],
      categoria: 'politica',
      oreFa: 5,
      fonti: [
        { title: 'La nota Anci sui piccoli comuni', url: 'https://esempio.it/anci-nota', publisher: 'Anci' },
        { title: 'Il decreto arriva giovedì', url: 'https://esempio.it/decreto-aree', publisher: 'Ansa' },
      ],
    },
    {
      title: 'Dazi agroalimentari: la lista di ritorsione europea slitta a settembre',
      summary:
        'Il rinvio è confermato da due fonti diplomatiche. Confagricoltura quantifica l’esposizione italiana.',
      score: 51,
      keywords: ['dazi', 'agroalimentare', 'unione europea'],
      categoria: 'mondo',
      oreFa: 9,
      fonti: [
        { title: 'Bruxelles rinvia la lista', url: 'https://esempio.it/dazi-rinvio', publisher: 'Reuters' },
      ],
    },
    {
      title: 'Musei, il sorpasso di Pompei apre il dibattito sui fondi al Sud',
      summary:
        'I dati del ministero circolano da ieri. Due quotidiani nazionali collegano il tema alla ripartizione dei fondi.',
      score: 38,
      keywords: ['musei', 'pompei', 'cultura', 'mezzogiorno'],
      categoria: 'cultura',
      oreFa: 26,
      fonti: [
        { title: 'I numeri del primo semestre', url: 'https://esempio.it/musei-dati', publisher: 'Ministero' },
        { title: 'Il dibattito sui fondi', url: 'https://esempio.it/fondi-sud', publisher: 'Il Mattino' },
      ],
    },
  ]

  let topicCreati = 0
  for (const t of TOPICS) {
    const chiave = t.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)

    const esistente = await payload.find({
      collection: 'hot-topics',
      where: { clusterKey: { equals: chiave } },
      limit: 1,
      overrideAccess: true,
    })
    if (esistente.docs[0]) continue

    await payload.create({
      collection: 'hot-topics',
      overrideAccess: true,
      data: {
        title: t.title,
        summary: t.summary,
        score: t.score,
        status: 'nuovo',
        detectedAt: new Date(Date.now() - t.oreFa * 3600_000).toISOString(),
        keywords: t.keywords,
        suggestedCategory: idCategoria.get(t.categoria),
        clusterKey: chiave,
        references: t.fonti.map((f) => ({ ...f, publishedAt: new Date().toISOString() })),
      } as never,
    })
    topicCreati++
  }
  log(`hot topic creati: ${topicCreati}`)

  /* --- Sezioni della home ------------------------------------------------- */

  await payload.updateGlobal({
    slug: 'site-settings',
    overrideAccess: true,
    data: {
      legalNotice:
        'Quotidiano online di politica e attualità. Registrazione Tribunale di Roma n. 214/2024.',
      companyDetails: 'P. IVA 04871230581 — Via dei Serpenti 42, 00184 Roma',
      editorInChief: 'Emanuele Ragusa',
      homeSections: ['politica', 'mondo', 'economia', 'cultura']
        .map((slug) => idCategoria.get(slug))
        .filter(Boolean)
        .map((category) => ({ category, limit: 2 })),
    } as never,
  })

  /* --- Impostazioni AI dimostrative --------------------------------------- */

  /*
   * Attiviamo il modulo AI senza chiave: cosi la dimostrazione mostra le
   * schermate dell assistente popolate, e allo stesso tempo si vede il
   * comportamento corretto quando manca la configurazione del provider
   * (messaggio esplicito, nessun errore di sistema) — RNF-10.
   */
  await payload.updateGlobal({
    slug: 'ai-settings',
    overrideAccess: true,
    data: {
      enabled: true,
      editorialProfile:
        'Quotidiano nazionale di politica, economia e attualita. Attenzione ai territori e agli effetti concreti delle decisioni pubbliche.',
      themes: ['politica', 'economia', 'aree interne', 'cultura'],
      minScore: 30,
    } as never,
  })
  log('impostazioni AI attivate (senza chiave: modalita dimostrativa)')

  log('completato')
  process.exit(0)
}

main().catch((err) => {
  console.error('[demo] errore:', err)
  process.exit(1)
})
