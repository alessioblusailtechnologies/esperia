import { createHash } from 'node:crypto'
import type { NotiziaNormalizzata } from '@/lib/fonti'
import { radici } from './testo'

/**
 * Raggruppamento delle notizie che parlano dello stesso fatto — RF-AI-02.
 *
 * Confronto sui titoli, pesato per rarita' delle parole (IDF calcolato sulle
 * notizie della finestra): in un insieme di testate locali "Taranto" o
 * "comune" compaiono ovunque e non dicono nulla, mentre "sciopero" o "Ilva"
 * identificano il fatto. Senza il peso, due notizie qualunque sulla stessa
 * citta' finirebbero nello stesso argomento.
 *
 * L'assegnazione e' greedy in ordine cronologico, contro il "nucleo" del gruppo
 * (le radici presenti in piu' di meta' delle sue notizie) e non contro la sua
 * unione: confrontare con l'unione farebbe crescere i gruppi a catena, finche'
 * un argomento ne inghiotte altri che non c'entrano.
 */

export interface NotiziaDaRaggruppare extends NotiziaNormalizzata {
  fonteId: string
}

export interface Gruppo {
  /** Impronta stabile: deriva dalla prima notizia del gruppo in ordine di tempo. */
  chiave: string
  notizie: NotiziaDaRaggruppare[]
  /** La notizia che meglio rappresenta il gruppo: da qui titolo e sintesi. */
  rappresentativa: NotiziaDaRaggruppare
  paroleChiave: string[]
}

/**
 * Quota minima del peso in comune perche' una notizia entri in un gruppo.
 * Con due sole parole in comune si chiede di piu': "Iran" e "Usa" insieme
 * compaiono in fatti diversi della stessa giornata. Con tre o piu' la
 * coincidenza e' gia' di per se' un indizio forte, e titoli riscritti da
 * testate diverse ("Sanchez convoca le elezioni anticipate il 29 novembre"
 * contro "Sánchez: elezioni anticipate il 29 novembre. Spagna scelga...")
 * arrivano raramente oltre il 40%. Valori tarati su feed nazionali reali con
 * `pnpm --filter @esperia/cms prova:hot-topic`.
 */
const SOGLIA_DUE_PAROLE = 0.5
const SOGLIA_TRE_PAROLE = 0.35
const PAROLE_CHIAVE_MAX = 5

interface GruppoInCostruzione {
  notizie: NotiziaDaRaggruppare[]
  radiciNotizie: Array<Map<string, string>>
  conteggi: Map<string, number>
}

function nucleo(g: GruppoInCostruzione): string[] {
  const n = g.notizie.length
  return [...g.conteggi].filter(([, c]) => c > n / 2).map(([r]) => r)
}

export function impronta(url: string): string {
  return createHash('sha1').update(url).digest('hex').slice(0, 20)
}

export function raggruppa(notizie: NotiziaDaRaggruppare[]): Gruppo[] {
  // Una notizia puo' arrivare da piu' fonti configurate: conta una volta.
  const uniche = [...new Map(notizie.map((n) => [n.url, n])).values()].sort(
    (a, b) => a.dataPubblicazione.localeCompare(b.dataPubblicazione) || a.url.localeCompare(b.url),
  )

  const radiciPer = uniche.map((n) => radici(n.titolo))

  const df = new Map<string, number>()
  for (const r of radiciPer) for (const k of r.keys()) df.set(k, (df.get(k) ?? 0) + 1)
  const totale = uniche.length
  const idf = (k: string) => Math.log((totale + 1) / ((df.get(k) ?? 0) + 1)) + 0.1
  const peso = (ks: Iterable<string>) => {
    let s = 0
    for (const k of ks) s += idf(k)
    return s
  }

  const gruppi: GruppoInCostruzione[] = []

  uniche.forEach((notizia, i) => {
    const mie = radiciPer[i]!
    if (mie.size === 0) return

    let migliore: GruppoInCostruzione | null = null
    let punteggioMigliore = 0

    for (const g of gruppi) {
      const centro = nucleo(g)
      const comuni = centro.filter((k) => mie.has(k))
      if (comuni.length < 2) continue
      const soglia = comuni.length === 2 ? SOGLIA_DUE_PAROLE : SOGLIA_TRE_PAROLE

      const somiglianza = peso(comuni) / Math.min(peso(mie.keys()), peso(centro))
      if (somiglianza >= soglia && somiglianza > punteggioMigliore) {
        migliore = g
        punteggioMigliore = somiglianza
      }
    }

    const g: GruppoInCostruzione = migliore ?? {
      notizie: [],
      radiciNotizie: [],
      conteggi: new Map(),
    }
    if (!migliore) gruppi.push(g)

    g.notizie.push(notizia)
    g.radiciNotizie.push(mie)
    for (const k of mie.keys()) g.conteggi.set(k, (g.conteggi.get(k) ?? 0) + 1)
  })

  return gruppi.map((g) => {
    const centro = new Set(nucleo(g))

    // Rappresentativa: la notizia che copre piu' peso del nucleo; a parita', la piu' vecchia.
    let indice = 0
    let coperto = -1
    g.radiciNotizie.forEach((r, i) => {
      const p = peso([...r.keys()].filter((k) => centro.has(k)))
      if (p > coperto) {
        coperto = p
        indice = i
      }
    })

    const forme = new Map<string, string>()
    for (const r of g.radiciNotizie) for (const [k, f] of r) if (!forme.has(k)) forme.set(k, f)

    const paroleChiave = [...g.conteggi]
      .filter(([k]) => centro.has(k) || g.notizie.length === 1)
      .sort((a, b) => b[1] * idf(b[0]) - a[1] * idf(a[0]))
      .slice(0, PAROLE_CHIAVE_MAX)
      .map(([k]) => forme.get(k)!)

    return {
      chiave: impronta(g.notizie[0]!.url),
      notizie: g.notizie,
      rappresentativa: g.notizie[indice]!,
      paroleChiave,
    }
  })
}
