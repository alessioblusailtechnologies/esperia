#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

/**
 * Genera le copertine della versione dimostrativa.
 *
 *   node apps/portal/scripts/genera-copertine.mjs
 *
 * I file prodotti stanno in `public/mock/media/` e sono VERSIONATI: questo
 * script non gira durante la build, serve solo a rigenerarli se si cambia
 * palette, formati o composizioni.
 *
 * PERCHE' COMPOSIZIONI ASTRATTE E NON FOTOGRAFIE. Gli articoli dimostrativi
 * sono inventati e il sito e' pubblicamente raggiungibile: una fotografia di
 * una persona reale accanto a una notizia inventata la fa sembrare autentica.
 * Le quattro immagini in `Design portale Esperia/uploads` sono inutilizzabili
 * per questo — tre ritraggono politici reali, la quarta e' lo screenshot del
 * sito di qualcun altro. Se il Committente fornisce fotografie con licenza
 * d'uso, si sostituiscono i file mantenendo i nomi: il codice non cambia.
 *
 * Dipende da `sharp`, che nel monorepo e' installato con il CMS.
 */

const require = createRequire(import.meta.url)

let sharp
try {
  sharp = require('sharp')
} catch {
  console.error(
    'sharp non risolvibile da qui. Eseguire dalla radice del monorepo, dove la\n' +
      'dipendenza del CMS e\' raggiungibile:  node apps/portal/scripts/genera-copertine.mjs',
  )
  process.exit(1)
}

const QUI = path.dirname(fileURLToPath(import.meta.url))
const USCITA = path.resolve(QUI, '../public/mock/media')

/* Palette da src/styles/tokens.css e colori di categoria da cms/src/lib/seed.ts */
const CARTA = '#faf7f0'
const SUPERFICIE = '#f1ebdd'
const INCHIOSTRO = '#211d18'

const COLORI = {
  cronaca: '#b3261e',
  mondo: '#0f6b6b',
  politica: '#1b4d8f',
  economia: '#1b5e20',
  cultura: '#6a1b9a',
  sport: '#e65100',
}

/* Le stesse quattro varianti che Payload genera al caricamento — RF-B-07. */
const VARIANTI = [
  { nome: 'thumbnail', width: 400, height: 300 },
  { nome: 'card', width: 768, height: 512 },
  { nome: 'hero', width: 1600, height: 900 },
  { nome: 'og', width: 1200, height: 630 },
]

/*
 * Gli archetipi sono assegnati a mano, non con `indice % 5`: due copertine
 * della stessa categoria che ricadono sullo stesso archetipo risultano
 * praticamente identiche, e in pagina si notano subito (successo la prima
 * volta, fra due articoli di Economia negli "articoli correlati").
 */
const COPERTINE = [
  { slug: 'cop-01', categoria: 'politica', archetipo: 0 },
  { slug: 'cop-02', categoria: 'mondo', archetipo: 1 },
  { slug: 'cop-03', categoria: 'economia', archetipo: 2 },
  { slug: 'cop-04', categoria: 'cultura', archetipo: 3 },
  { slug: 'cop-05', categoria: 'politica', archetipo: 3 },
  { slug: 'cop-06', categoria: 'cronaca', archetipo: 4 },
  { slug: 'cop-07', categoria: 'mondo', archetipo: 4 },
  { slug: 'cop-08', categoria: 'economia', archetipo: 0 },
  { slug: 'cop-09', categoria: 'cronaca', archetipo: 2 },
  { slug: 'cop-10', categoria: 'cultura', archetipo: 1 },
  { slug: 'cop-11', categoria: 'sport', archetipo: 0 },
  { slug: 'cop-12', categoria: 'sport', archetipo: 3 },
]

const W = 1600
const H = 900

/** Generatore deterministico: la stessa copertina a ogni esecuzione. */
function rnd(seme) {
  let s = seme * 9301 + 49297
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

/** Cinque composizioni, tutte con il peso al centro: le varianti 4:3 tagliano i lati. */
function composizione(indice, colore, archetipo) {
  const r = rnd(indice * 13 + 7)

  const fondo = `<rect width="${W}" height="${H}" fill="${CARTA}"/>`
  const griglia = `<g opacity="0.5">${Array.from(
    { length: 9 },
    (_, i) =>
      `<line x1="${(i + 1) * (W / 10)}" y1="0" x2="${(i + 1) * (W / 10)}" y2="${H}" stroke="${SUPERFICIE}" stroke-width="1"/>`,
  ).join('')}</g>`

  let forme = ''

  if (archetipo === 0) {
    const cy = H * (0.52 + r() * 0.1)
    forme = `
      <rect x="0" y="${cy - 4}" width="${W}" height="8" fill="${INCHIOSTRO}" opacity="0.9"/>
      <circle cx="${W / 2}" cy="${cy}" r="${230 + r() * 70}" fill="${colore}" opacity="0.16"/>
      <path d="M ${W / 2 - 300} ${cy} A 300 300 0 0 1 ${W / 2 + 300} ${cy}" fill="none" stroke="${colore}" stroke-width="26"/>
      <circle cx="${W / 2}" cy="${cy}" r="34" fill="${CARTA}" stroke="${INCHIOSTRO}" stroke-width="7"/>`
  } else if (archetipo === 1) {
    const n = 11
    const larghezza = 62
    const passo = W / (n + 1)
    forme = Array.from({ length: n }, (_, i) => {
      const h = H * (0.22 + r() * 0.5)
      const x = passo * (i + 1) - larghezza / 2
      const c = i % 3 === 0 ? colore : INCHIOSTRO
      const op = i % 3 === 0 ? 0.7 : 0.12 + r() * 0.12
      return `<rect x="${x}" y="${H - h - 90}" width="${larghezza}" height="${h}" fill="${c}" opacity="${op.toFixed(2)}"/>`
    }).join('')
    forme += `<rect x="0" y="${H - 90}" width="${W}" height="5" fill="${INCHIOSTRO}" opacity="0.85"/>`
  } else if (archetipo === 2) {
    const cx = W * (0.42 + r() * 0.16)
    const cy = H * 0.5
    forme = Array.from({ length: 7 }, (_, i) => {
      const rr = 70 + i * 62
      return `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="none" stroke="${i % 2 ? colore : INCHIOSTRO}" stroke-width="${i % 2 ? 16 : 3}" opacity="${i % 2 ? 0.55 : 0.35}"/>`
    }).join('')
    forme += `<circle cx="${cx}" cy="${cy}" r="46" fill="${colore}" opacity="0.85"/>`
  } else if (archetipo === 3) {
    const spessore = 26 + r() * 14
    forme = `
      <polygon points="0,${H} ${W * 0.45},0 ${W * 0.62},0 ${W * 0.17},${H}" fill="${colore}" opacity="0.22"/>
      <polygon points="${W * 0.38},${H} ${W * 0.83},0 ${W},0 ${W * 0.55},${H}" fill="${INCHIOSTRO}" opacity="0.10"/>
      <line x1="0" y1="${H * 0.78}" x2="${W}" y2="${H * 0.78}" stroke="${INCHIOSTRO}" stroke-width="6" opacity="0.9"/>
      <rect x="${W / 2 - 130}" y="${H / 2 - 130}" width="260" height="260" fill="none" stroke="${colore}" stroke-width="${spessore}" opacity="0.75"/>`
  } else {
    const cols = 6
    const rows = 3
    const lato = 150
    const gx = (W - cols * lato) / 2
    const gy = (H - rows * lato) / 2
    const pieno = Math.floor(r() * cols * rows)
    forme = Array.from({ length: cols * rows }, (_, i) => {
      const x = gx + (i % cols) * lato
      const y = gy + Math.floor(i / cols) * lato
      if (i === pieno) {
        return `<rect x="${x + 12}" y="${y + 12}" width="${lato - 24}" height="${lato - 24}" fill="${colore}" opacity="0.9"/>`
      }
      return `<rect x="${x + 12}" y="${y + 12}" width="${lato - 24}" height="${lato - 24}" fill="none" stroke="${INCHIOSTRO}" stroke-width="2" opacity="${(0.18 + r() * 0.3).toFixed(2)}"/>`
    }).join('')
  }

  const cornice = `<rect x="26" y="26" width="${W - 52}" height="${H - 52}" fill="none" stroke="${INCHIOSTRO}" stroke-width="2" opacity="0.22"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${fondo}${griglia}${forme}${cornice}</svg>`
}

fs.mkdirSync(USCITA, { recursive: true })

for (const [i, voce] of COPERTINE.entries()) {
  const colore = COLORI[voce.categoria] ?? INCHIOSTRO
  const svg = Buffer.from(composizione(i, colore, voce.archetipo))

  await sharp(svg).webp({ quality: 88 }).toFile(path.join(USCITA, `${voce.slug}.webp`))
  for (const v of VARIANTI) {
    await sharp(svg)
      .resize(v.width, v.height, { fit: 'cover', position: 'centre' })
      .webp({ quality: 86 })
      .toFile(path.join(USCITA, `${voce.slug}-${v.nome}.webp`))
  }

  console.log(`${voce.slug} — ${voce.categoria}, archetipo ${voce.archetipo}`)
}

console.log(`\n${COPERTINE.length} copertine in ${path.relative(process.cwd(), USCITA)}`)
