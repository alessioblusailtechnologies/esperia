import { contieneEspressione, normalizza, radici } from './testo'

/**
 * Punteggio di rilevanza di un argomento, da 0 a 100 — RF-AI-03.
 *
 *   volume × freschezza × affinita' × peso medio delle fonti
 *
 * - volume: quante testate DIVERSE ne parlano. Una testata sola vale 0,4: un
 *   pezzo isolato non e' un argomento caldo, a meno che non tocchi in pieno la
 *   linea editoriale. Due testate 0,64, tre 0,78, e cosi' via verso 1.
 * - freschezza: dimezza ogni 12 ore dall'ultima notizia.
 * - affinita': 0,6 di base, fino a 1 se l'argomento tocca ambiti tematici o
 *   parole chiave da privilegiare configurati in Impostazioni AI.
 *
 * Con la soglia predefinita di 30 passano: due testate su un fatto qualunque
 * delle ultime ore, oppure una testata sola su un fatto in linea con la testata.
 *
 * La funzione lavora sui riferimenti, non sui gruppi, perche' serve anche a
 * ricalcolare il punteggio di argomenti gia' salvati che non ricevono piu'
 * notizie: senza quel ricalcolo un argomento di tre giorni fa resterebbe in
 * cima all'elenco con il punteggio del giorno in cui era caldo.
 */

export interface RiferimentoPerPunteggio {
  titolo: string
  testata?: string | null
  dataPubblicazione?: string | null
  fonteId?: string | null
}

export interface CriteriRilevanza {
  themes: string[]
  boostKeywords: string[]
}

const DIMEZZAMENTO_ORE = 12
const AFFINITA_BASE = 0.6

export function volume(testate: number): number {
  return 1 - Math.pow(0.6, Math.max(testate, 1))
}

export function freschezza(ultima: Date, adesso: Date): number {
  const ore = Math.max(0, (adesso.getTime() - ultima.getTime()) / 3_600_000)
  return Math.pow(0.5, ore / DIMEZZAMENTO_ORE)
}

/**
 * Un ambito tematico ("economia del mare") conta se compare almeno meta' delle
 * sue parole significative; una parola chiave da privilegiare conta solo se
 * compare intera.
 */
export function affinita(testo: string, criteri: CriteriRilevanza): number {
  const normalizzato = normalizza(testo)
  const presenti = radici(testo)

  let riscontri = criteri.boostKeywords.filter((k) => contieneEspressione(normalizzato, k)).length

  for (const ambito of criteri.themes) {
    const sue = [...radici(ambito).keys()]
    if (sue.length === 0) continue
    const trovate = sue.filter((k) => presenti.has(k)).length
    if (trovate >= Math.ceil(sue.length / 2)) riscontri++
  }

  return AFFINITA_BASE + (1 - AFFINITA_BASE) * Math.min(1, riscontri / 2)
}

export function calcolaPunteggio(
  riferimenti: RiferimentoPerPunteggio[],
  testoAggiuntivo: string,
  criteri: CriteriRilevanza,
  pesoFonte: (fonteId: string | null | undefined) => number,
  adesso = new Date(),
): number {
  if (riferimenti.length === 0) return 0

  const testate = new Set(riferimenti.map((r) => normalizza(r.testata ?? '') || '?')).size

  const date = riferimenti
    .map((r) => new Date(r.dataPubblicazione ?? ''))
    .filter((d) => !Number.isNaN(d.getTime()))
  const ultima = date.length > 0 ? new Date(Math.max(...date.map((d) => d.getTime()))) : adesso

  const fonti = [...new Set(riferimenti.map((r) => r.fonteId ?? ''))]
  const pesoMedio = fonti.reduce((s, f) => s + pesoFonte(f || null), 0) / fonti.length

  const testo = [...riferimenti.map((r) => r.titolo), testoAggiuntivo].join('\n')

  const grezzo =
    100 * volume(testate) * freschezza(ultima, adesso) * affinita(testo, criteri) * pesoMedio
  return Math.round(Math.min(100, Math.max(0, grezzo)) * 10) / 10
}

/** La notizia tocca un argomento che la redazione ha chiesto di non vedere mai? */
export function escluso(testo: string, excludeKeywords: string[]): boolean {
  const normalizzato = normalizza(testo)
  return excludeKeywords.some((k) => contieneEspressione(normalizzato, k))
}
