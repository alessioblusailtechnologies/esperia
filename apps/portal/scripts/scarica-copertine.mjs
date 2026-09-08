#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

/**
 * Scarica le fotografie di copertina della versione dimostrativa e ne genera
 * le varianti.
 *
 *   node apps/portal/scripts/scarica-copertine.mjs
 *
 * I file prodotti stanno in `public/mock/media/` e sono VERSIONATI: lo script
 * non gira durante la build, serve solo a rigenerarli.
 *
 * PERCHE' WIKIMEDIA COMMONS. Serve materiale con licenza verificabile e
 * un'origine citabile: Commons ospita solo contenuti liberi e l'API restituisce
 * autore e licenza, che finiscono nel campo crediti mostrato sotto la foto
 * nell'articolo. I file sono fissati per nome, non cercati per parola chiave,
 * altrimenti il risultato cambierebbe a ogni esecuzione.
 *
 * COSA NON VA MESSO QUI. Gli articoli dimostrativi sono inventati e il sito e'
 * pubblicamente raggiungibile: una fotografia che ritrae una persona reale
 * identificabile, accostata a una notizia falsa, la fa sembrare autentica.
 * Le immagini scelte mostrano luoghi, edifici e infrastrutture; dove compaiono
 * persone sono folle o figure non riconoscibili, e nessun articolo dice
 * alcunche' su di loro. Vale anche per i marchi: niente stabilimenti di
 * un'azienda accostati a notizie che ne riguardano un'altra.
 */

const require = createRequire(import.meta.url)

let sharp
try {
  sharp = require('sharp')
} catch {
  console.error('sharp non risolvibile. Eseguire dalla radice del monorepo.')
  process.exit(1)
}

const QUI = path.dirname(fileURLToPath(import.meta.url))
const MEDIA = path.resolve(QUI, '../public/mock/media')
const MODULO = path.resolve(QUI, '../src/mock/copertine.ts')

const API = 'https://commons.wikimedia.org/w/api.php'
const UA = 'EsperiaDemo/1.0 (contenuti dimostrativi)'

/* Le stesse quattro varianti che Payload genera al caricamento — RF-B-07. */
const VARIANTI = [
  { nome: 'thumbnail', width: 400, height: 300 },
  { nome: 'card', width: 768, height: 512 },
  { nome: 'hero', width: 1600, height: 900 },
  { nome: 'og', width: 1200, height: 630 },
]

const COPERTINE = [
  {
    slug: 'cop-01',
    file: 'File:Palazzo Chigi - Roma (2010).jpg',
    alt: 'Palazzo Chigi a Roma, sede del governo, accanto alla Colonna di Marco Aurelio',
  },
  {
    slug: 'cop-02',
    file: 'File:Berlaymont-Building-1.Jpg',
    alt: 'L’ingresso del palazzo Berlaymont, sede della Commissione europea a Bruxelles',
  },
  {
    slug: 'cop-03',
    file: 'File:Construction site of New Qinghe Railway Station (20190610155029).jpg',
    alt: 'La struttura metallica di una stazione ferroviaria in costruzione',
  },
  {
    slug: 'cop-04',
    file: 'File:Terme del Foro 6.JPG',
    alt: 'Un ambiente delle Terme del Foro nell’area archeologica di Pompei',
  },
  {
    slug: 'cop-05',
    file: 'File:Roccacaramanico - panorama autunnale.jpg',
    alt: 'Il borgo montano di Roccacaramanico, in Abruzzo, tra i boschi in autunno',
  },
  {
    slug: 'cop-06',
    file: 'File:Yttre vågbrytaren Visby hamn.jpg',
    alt: 'Onde che frangono sulla diga foranea di un porto durante una mareggiata',
  },
  {
    slug: 'cop-07',
    file: 'File:Palais des nations.jpg',
    alt: 'Il Palais des Nations di Ginevra, sede europea delle Nazioni Unite',
  },
  {
    slug: 'cop-08',
    file: 'File:Fiat Mirafiori 001.JPG',
    alt: 'Lo stabilimento di Mirafiori, a Torino, visto dalla strada',
  },
  {
    slug: 'cop-09',
    file: 'File:Roma Metro B EUR Magliana marciapiede.jpg',
    alt: 'La banchina deserta della stazione EUR Magliana, sulla linea B della metropolitana di Roma',
  },
  {
    slug: 'cop-10',
    file: 'File:Audience view inside main auditorium - Wikimania 2026 - Paris by @JJxFile 0073 17.jpg',
    alt: 'Il pubblico seduto nella platea di un auditorium durante un incontro',
  },
  {
    slug: 'cop-11',
    file: 'File:Track and field stadium-2.jpg',
    alt: 'Veduta dall’alto della pista di atletica e del campo interno di uno stadio',
    // L'API restituisce una stringa di attribuzione derivata e illeggibile.
    autore: 'Jesfr',
  },
  {
    slug: 'cop-12',
    file: 'File:Womens Olympic Road Race Peleton - July 2012.jpg',
    alt: 'Il gruppo dei ciclisti durante una corsa su strada, tra il pubblico ai lati',
  },
]

function pulisci(html) {
  return (html ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "CC BY-SA 4.0" resta com'e'; il pubblico dominio si scrive in italiano. */
function licenzaLeggibile(grezza) {
  if (!grezza) return 'licenza libera'
  return /public domain|^pd/i.test(grezza) ? 'pubblico dominio' : grezza
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Richiesta con attesa progressiva.
 *
 * Commons risponde 429 se lo si interroga troppo in fretta, e uno script che
 * scarica una dozzina di file ci arriva senza fatica. Meglio metterci qualche
 * secondo in piu' che lasciare la cartella a meta'.
 */
async function conRitentativi(url, tentativi = 5) {
  for (let i = 0; i < tentativi; i++) {
    const res = await fetch(url, { headers: { 'user-agent': UA } })
    if (res.ok) return res
    if (res.status !== 429 && res.status < 500) {
      throw new Error(`richiesta fallita (${res.status}) — ${url}`)
    }
    const attesa = 2000 * 2 ** i
    console.log(`  ${res.status}: riprovo fra ${attesa / 1000}s`)
    await pausa(attesa)
  }
  throw new Error(`richiesta fallita dopo ${tentativi} tentativi — ${url}`)
}

async function informazioni(titolo) {
  const url =
    `${API}?action=query&titles=${encodeURIComponent(titolo)}` +
    `&prop=imageinfo&iiprop=url%7Cextmetadata%7Csize&iiurlwidth=1600&format=json`

  const res = await conRitentativi(url)
  const j = await res.json()
  const pagina = Object.values(j.query?.pages ?? {})[0]
  const info = pagina?.imageinfo?.[0]
  if (!info) throw new Error(`${titolo}: non trovato su Commons`)
  return info
}

fs.mkdirSync(MEDIA, { recursive: true })

/**
 * Registro gia' prodotto, se c'e'.
 *
 * Il modulo generato e' JSON con un'intestazione davanti, quindi si rilegge
 * senza dipendenze. Serve a riprendere: Commons applica un limite di frequenza
 * e una dozzina di file lo raggiunge, cosi' un'interruzione a meta' non
 * costringe a riscaricare quello che c'e' gia'.
 */
function registroEsistente() {
  if (!fs.existsSync(MODULO)) return {}
  const testo = fs.readFileSync(MODULO, 'utf8')
  const inizio = testo.indexOf('= {')
  if (inizio < 0) return {}
  try {
    return JSON.parse(testo.slice(inizio + 2))
  } catch {
    return {}
  }
}

function giaCompleta(slug) {
  const attesi = [`${slug}.webp`, ...VARIANTI.map((v) => `${slug}-${v.nome}.webp`)]
  return attesi.every((f) => fs.existsSync(path.join(MEDIA, f)))
}

const registro = registroEsistente()

function scriviModulo() {
  const intestazione = `/**
 * Provenienza delle fotografie dimostrative — GENERATO, non modificare a mano.
 *
 * Prodotto da scripts/scarica-copertine.mjs. Il campo \`credito\` finisce sotto
 * la foto nella pagina articolo: e' li' che le licenze CC BY e CC BY-SA
 * ottengono l'attribuzione che richiedono, quindi non va tolto dal design.
 */

export interface CopertinaMock {
  /** Testo alternativo: obbligatorio, RNF-07. */
  alt: string
  /** Autore e licenza, mostrati sotto l'immagine nell'articolo. */
  credito: string
  /** Pagina di Commons da cui proviene il file. */
  fonte: string
}

export const COPERTINE: Record<string, CopertinaMock> = `

  const ordinato = Object.fromEntries(
    COPERTINE.map((v) => [v.slug, registro[v.slug]]).filter(([, dati]) => dati),
  )
  fs.writeFileSync(MODULO, intestazione + JSON.stringify(ordinato, null, 2) + '\n')
}

for (const voce of COPERTINE) {
  if (registro[voce.slug] && giaCompleta(voce.slug)) {
    console.log(`${voce.slug}  gia' presente, salto`)
    continue
  }

  const info = await informazioni(voce.file)
  const meta = info.extmetadata ?? {}

  const autore = voce.autore ?? pulisci(meta.Artist?.value) ?? 'autore non indicato'
  const licenza = licenzaLeggibile(pulisci(meta.LicenseShortName?.value))

  const risposta = await conRitentativi(info.thumburl)
  const originale = Buffer.from(await risposta.arrayBuffer())

  /*
   * L'originale non viene mai servito — ogni chiamata a mediaUrl() chiede una
   * variante — ma il campo `url` di Media deve puntare a un file esistente.
   * Lo teniamo a 1600px: a 2000 pesava da solo quasi la meta' della cartella.
   */
  await sharp(originale)
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 74 })
    .toFile(path.join(MEDIA, `${voce.slug}.webp`))

  for (const v of VARIANTI) {
    await sharp(originale)
      // `attention` sceglie il ritaglio attorno alla zona piu' significativa:
      // su una fotografia un taglio centrato decapita mezze inquadrature.
      .resize(v.width, v.height, { fit: 'cover', position: 'attention' })
      .webp({ quality: 74 })
      .toFile(path.join(MEDIA, `${voce.slug}-${v.nome}.webp`))
  }

  registro[voce.slug] = {
    alt: voce.alt,
    credito: `Foto: ${autore} — ${licenza}, Wikimedia Commons`,
    fonte: info.descriptionurl,
  }

  // Scritto subito, non alla fine: e' cio' che rende ripartibile lo script.
  scriviModulo()

  console.log(`${voce.slug}  ${licenza.padEnd(16)}  ${autore}`)

  // Due richieste a copertina: si sta larghi invece di farsi respingere.
  await pausa(1500)
}

console.log(`\n${Object.keys(registro).length} copertine in ${path.relative(process.cwd(), MEDIA)}`)
console.log(`provenienza in ${path.relative(process.cwd(), MODULO)}`)
