/** Formattazioni in italiano. RNF-09. */

const dataLunga = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const dataOra = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatData(value: string | null | undefined): string {
  if (!value) return ''
  return dataLunga.format(new Date(value))
}

export function formatDataOra(value: string | null | undefined): string {
  if (!value) return ''
  return dataOra.format(new Date(value))
}

/** Attributo datetime del tag <time>: sempre ISO, indipendente dalla lingua. */
export function isoDate(value: string | null | undefined): string {
  if (!value) return ''
  return new Date(value).toISOString()
}

/**
 * "3 ore fa", "ieri", "2 giorni fa". Sopra la settimana torniamo alla data
 * assoluta: "37 giorni fa" non aiuta nessuno.
 */
const relativo = new Intl.RelativeTimeFormat('it-IT', { numeric: 'auto' })

export function formatRelativo(value: string | null | undefined): string {
  if (!value) return ''
  const diffMs = new Date(value).getTime() - Date.now()
  const minuti = Math.round(diffMs / 60000)

  if (Math.abs(minuti) < 60) return relativo.format(minuti, 'minute')

  const ore = Math.round(minuti / 60)
  if (Math.abs(ore) < 24) return relativo.format(ore, 'hour')

  const giorni = Math.round(ore / 24)
  if (Math.abs(giorni) <= 7) return relativo.format(giorni, 'day')

  return formatData(value)
}

export function tempoLettura(minuti: number | null | undefined): string {
  if (!minuti || minuti < 1) return ''
  return `${minuti} min di lettura`
}

export function firmaAutori(nomi: string[]): string {
  if (nomi.length === 0) return ''
  if (nomi.length === 1) return nomi[0]!
  return `${nomi.slice(0, -1).join(', ')} e ${nomi[nomi.length - 1]}`
}
