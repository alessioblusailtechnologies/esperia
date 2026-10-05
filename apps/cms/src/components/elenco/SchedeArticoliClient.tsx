'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

import { SCHEDE } from './schede'

/** Parte client delle schede: sa quale è attiva leggendo il filtro nell'indirizzo. */
export function SchedeArticoliClient({ conteggi }: { conteggi: Array<number | null> }) {
  const percorso = usePathname()
  const parametri = useSearchParams()

  const attiva =
    SCHEDE.find(
      (s) => s.campo && parametri.get(`where[${s.campo}][equals]`) === s.valore,
    )?.chiave ?? (parametri.toString().includes('where') ? null : 'tutti')

  function indirizzo(campo?: string, valore?: string): string {
    // Si tengono ricerca e ordinamento, si sostituisce solo il filtro di stato.
    const p = new URLSearchParams()
    for (const k of ['search', 'sort', 'limit']) {
      const v = parametri.get(k)
      if (v) p.set(k, v)
    }
    if (campo && valore) p.set(`where[${campo}][equals]`, valore)
    const q = p.toString()
    return q ? `${percorso}?${q}` : percorso
  }

  return (
    <nav className="schede-elenco" aria-label="Filtra per stato">
      {SCHEDE.map((s, i) => (
        <Link
          key={s.chiave}
          href={indirizzo(s.campo, s.valore)}
          className="schede-elenco__scheda"
          aria-current={attiva === s.chiave ? 'page' : undefined}
        >
          {s.etichetta}
          {conteggi[i] !== null && conteggi[i] !== undefined && (
            <span className="schede-elenco__numero">{conteggi[i]}</span>
          )}
        </Link>
      ))}
    </nav>
  )
}

export default SchedeArticoliClient
