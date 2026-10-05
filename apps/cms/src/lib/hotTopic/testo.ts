/**
 * Trattamento del testo per il raggruppamento degli hot topic — RF-AI-02.
 *
 * Nessuna dipendenza e nessuna chiamata AI: il rilevamento deve funzionare anche
 * con il modulo AI spento (RNF-10) e senza costi per esecuzione. La radice e'
 * volutamente rozza (prefisso di cinque lettere dopo aver tolto le vocali
 * finali): basta ad avvicinare "comune" e "comunale", "regione" e "regionale",
 * e gli errori che introduce sono assorbiti dalla soglia di parole in comune.
 */

const STOPWORD = new Set(
  `a ad al allo alla ai agli alle anche ancora avere aveva c che chi ci col come con contro cui da dal dallo
  dalla dai dagli dalle davanti del dello della dei degli delle dentro di dopo dove e ed era essere fa fino fra
  gia gli ha hanno ho i il in invece io l la le li lo loro ma mai meno mentre mi molto ne nei negli nel nello
  nella nelle no noi non nostro o oggi ogni oltre per perche piu poi poco proprio pure qua quale quando quanto
  quasi quella quelle quelli quello questa queste questi questo qui se secondo sei senza si sia siamo sono sotto
  sta stato stessa stesso su sua sue sugli sui sul sullo sulla sulle suo suoi tra tre tutti tutto un una uno
  verso vi via video foto ecco ieri domani ore anni anno nuovo nuova nuovi nuove dopo prima due fare fatto dice
  detto ultime ultima ultimo news live diretta`
    .split(/\s+/)
    .filter(Boolean),
)

/** Minuscole, senza accenti, solo lettere e cifre separate da spazi. */
export function normalizza(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function radice(parola: string): string {
  const senzaVocali = parola.replace(/[aeiou]+$/, '')
  const base = senzaVocali.length >= 4 ? senzaVocali : parola
  return base.slice(0, 5)
}

/** Parola significativa: non vuota, non un numero, non una stopword, almeno tre lettere. */
function significativa(parola: string): boolean {
  return parola.length >= 3 && !/^\d+$/.test(parola) && !STOPWORD.has(parola)
}

/**
 * Radici distinte del testo, con la forma originale piu' frequente di ciascuna:
 * la radice serve al confronto, la forma originale a mostrare parole chiave
 * leggibili ("comunale", non "comun").
 */
export function radici(testo: string): Map<string, string> {
  const esito = new Map<string, string>()
  for (const parola of normalizza(testo).split(' ')) {
    if (!significativa(parola)) continue
    const r = radice(parola)
    if (!esito.has(r)) esito.set(r, parola)
  }
  return esito
}

/**
 * Il testo contiene l'espressione come parole intere? "porto" non deve
 * scattare dentro "rapporto". Confronto su testo normalizzato.
 */
export function contieneEspressione(testoNormalizzato: string, espressione: string): boolean {
  const e = normalizza(espressione)
  if (!e) return false
  return ` ${testoNormalizzato} `.includes(` ${e} `)
}
