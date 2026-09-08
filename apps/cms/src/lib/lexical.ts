/**
 * Utilita' per estrarre testo semplice da un documento Lexical.
 *
 * Serve a due cose che non possono dipendere dal rendering:
 *  - l'indice di ricerca full-text (RF-P-05), perche' cercare dentro un jsonb
 *    annidato in Postgres e' lento e non si puo' pesare con ts_rank;
 *  - il tempo di lettura stimato mostrato sull'articolo.
 */

type LexicalNode = {
  type?: string
  text?: string
  children?: LexicalNode[]
  [key: string]: unknown
}

/** Nodi il cui contenuto non deve finire nell'indice di ricerca. */
const SKIPPED_TYPES = new Set(['upload', 'horizontalrule'])

export function lexicalToPlainText(root: unknown): string {
  const node = (root as { root?: LexicalNode })?.root
  if (!node) return ''

  const parts: string[] = []

  const walk = (n: LexicalNode | undefined): void => {
    if (!n || (n.type && SKIPPED_TYPES.has(n.type))) return
    if (typeof n.text === 'string' && n.text) parts.push(n.text)
    if (Array.isArray(n.children)) {
      for (const child of n.children) walk(child)
      // I nodi di blocco separano le parole: senza questo "fine.Inizio" si fonde.
      if (n.type && n.type !== 'text') parts.push('\n')
    }
  }

  walk(node)

  return parts
    .join(' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

/** Media di lettura assunta: 200 parole/minuto, arrotondata per eccesso al minuto. */
export function estimateReadingMinutes(plainText: string): number {
  const words = plainText.split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / 200))
}
