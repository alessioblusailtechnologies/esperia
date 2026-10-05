/**
 * Prova a secco del rilevamento: legge feed RSS veri, raggruppa e assegna il
 * punteggio, e stampa il risultato. Non tocca il database e non serve il CMS
 * avviato: e' lo strumento per tarare soglie e parole chiave prima di
 * configurarle in Impostazioni AI.
 *
 *   pnpm --filter @esperia/cms prova:hot-topic <url-feed> [<url-feed>...] \
 *     [--temi "cronaca locale,economia del mare"] [--privilegia "Taranto,porto"] \
 *     [--escludi "oroscopo"] [--soglia 30] [--tutti]
 */
import { leggiRss } from '@/lib/fonti/rss'
import { raggruppa, type NotiziaDaRaggruppare } from './cluster'
import { calcolaPunteggio, escluso } from './punteggio'

const argv = process.argv.slice(2)
const opzione = (nome: string) => {
  const i = argv.indexOf(`--${nome}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const elenco = (nome: string) =>
  (opzione(nome) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

const feed = argv.filter((a, i) => /^https?:\/\//.test(a) && !argv[i - 1]?.startsWith('--'))
if (feed.length === 0) {
  console.error('Indicare almeno un URL di feed RSS / Atom.')
  process.exit(1)
}

const criteri = { themes: elenco('temi'), boostKeywords: elenco('privilegia') }
const esclusioni = elenco('escludi')
const soglia = Number(opzione('soglia') ?? 30)
const mostraTutti = argv.includes('--tutti')
const adesso = new Date()
const inizioFinestra = new Date(adesso.getTime() - 48 * 3_600_000)

const notizie: NotiziaDaRaggruppare[] = []
for (const [i, url] of feed.entries()) {
  try {
    const lette = await leggiRss({
      id: `f${i}`,
      name: new URL(url).hostname,
      type: 'rss',
      endpoint: url,
    })
    const valide = lette.filter(
      (n) =>
        new Date(n.dataPubblicazione) >= inizioFinestra &&
        !escluso(`${n.titolo}\n${n.estratto ?? ''}`, esclusioni),
    )
    console.log(`✓ ${url} — ${lette.length} notizie, ${valide.length} nelle ultime 48 ore`)
    notizie.push(...valide.map((n) => ({ ...n, fonteId: `f${i}` })))
  } catch (err) {
    console.log(`✗ ${url} — ${(err as Error).message}`)
  }
}

const gruppi = raggruppa(notizie)
  .map((g) => ({
    g,
    punteggio: calcolaPunteggio(
      g.notizie.map((n) => ({
        titolo: n.titolo,
        testata: n.testata,
        dataPubblicazione: n.dataPubblicazione,
        fonteId: n.fonteId,
      })),
      g.rappresentativa.estratto ?? '',
      criteri,
      () => 1,
      adesso,
    ),
  }))
  .sort((a, b) => b.punteggio - a.punteggio)

const sopra = gruppi.filter((x) => x.punteggio >= soglia)
const multipli = gruppi.filter((x) => x.g.notizie.length > 1).length
console.log(
  `\n${notizie.length} notizie → ${gruppi.length} gruppi (${multipli} con più notizie), ${sopra.length} sopra la soglia ${soglia}\n`,
)

for (const { g, punteggio } of mostraTutti ? gruppi : sopra) {
  const testate = new Set(g.notizie.map((n) => n.testata)).size
  console.log(`[${punteggio.toFixed(1).padStart(5)}] ${g.rappresentativa.titolo}`)
  console.log(
    `        ${g.notizie.length} notizie, ${testate} testate · ${g.paroleChiave.join(', ')}`,
  )
  for (const n of g.notizie) console.log(`        - ${n.testata}: ${n.titolo}`)
}
