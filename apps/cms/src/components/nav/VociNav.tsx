'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export interface VoceNav {
  etichetta: string
  href: string
  /** Numero mostrato a destra: quante cose aspettano una decisione. */
  conteggio?: number
  /** La Dashboard è l'unica voce che va confrontata per intero: /admin è prefisso di tutto. */
  esatto?: boolean
}

/**
 * Voci della navigazione — parte client perché lo stato attivo dipende
 * dall'indirizzo corrente, che il server non conosce durante la navigazione
 * lato client di Next.
 */
export function VociNav({ voci }: { voci: VoceNav[] }) {
  const percorso = usePathname()

  const attiva = (v: VoceNav): boolean =>
    v.esatto ? percorso === v.href : percorso.startsWith(v.href)

  return (
    <nav className="nav-esperia__voci" aria-label="Sezioni del backoffice">
      <ul>
        {voci.map((v) => {
          const on = attiva(v)
          return (
            <li key={v.href}>
              <Link
                href={v.href}
                className={`nav-esperia__voce${on ? ' nav-esperia__voce--attiva' : ''}`}
                aria-current={on ? 'page' : undefined}
              >
                <span className="nav-esperia__etichetta">{v.etichetta}</span>
                {v.conteggio ? (
                  <span className="nav-esperia__conteggio">{v.conteggio}</span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export default VociNav
