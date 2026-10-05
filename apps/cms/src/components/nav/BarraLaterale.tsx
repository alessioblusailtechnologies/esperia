'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useNav } from '@payloadcms/ui'

import { Icona, type NomeIcona } from '@/components/Icona'
import { NuovoArticolo } from './NuovoArticolo'
import {
  CHIAVE_GRUPPI_CHIUSI,
  COOKIE_NAV_COMPATTA,
  EVENTO_NUOVO_ARTICOLO,
  type DettaglioNuovoArticolo,
} from './costanti'

/**
 * Barra laterale — parte client di NavLaterale.
 *
 * Due stati, come in Moonbrand Studio: estesa (264px) o compressa alle sole
 * icone (72px), scelta col pulsante in testa e ricordata in un cookie. Non
 * usiamo l'apertura/chiusura di Payload per questo, perché Payload chiude la
 * propria nav su ogni schermo sotto i 1440px: su un portatile la barra
 * sparirebbe a ogni caricamento. Lo stato di Payload resta in uso solo sul
 * telefono, dove la barra diventa un menu che entra da sinistra.
 */

export interface VoceNav {
  etichetta: string
  href: string
  icona: NomeIcona
  /** Quante cose aspettano una decisione: mai un totale. */
  conteggio?: number
  /** Cosa conta il numero, per il suggerimento al passaggio del mouse. */
  suggerimento?: string
  /** Numero in evidenza: è la coda che blocca il lavoro di altri. */
  evidenza?: boolean
  esatto?: boolean
  collezione?: string
  globale?: string
}

export interface GruppoNav {
  titolo: string
  richiudibile?: boolean
  voci: VoceNav[]
}

export interface BozzaInCorso {
  id: string
  titolo: string
  stato: 'bozza' | 'in_revisione'
}

export interface SpesaAi {
  spesi: number
  tetto: number
}

/** Riferimento stabile: un oggetto nuovo a ogni render riaprirebbe la finestra dal primo passo. */
const NESSUN_DETTAGLIO: DettaglioNuovoArticolo = {}

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

function iniziali(nome: string): string {
  return (
    nome
      .replace(/@.*/, '')
      .trim()
      .split(/[\s._-]+/)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('') || '?'
  )
}

export function BarraLaterale({
  gruppi,
  bozze,
  spesa,
  compattaIniziale,
  utente,
}: {
  gruppi: GruppoNav[]
  bozze: BozzaInCorso[]
  spesa: SpesaAi | null
  compattaIniziale: boolean
  utente: { nome: string; ruolo: string }
}) {
  const percorso = usePathname()
  const { navOpen, setNavOpen } = useNav()
  const [compatta, setCompatta] = useState(compattaIniziale)
  const [chiusi, setChiusi] = useState<Record<string, boolean>>({})
  const [nuovo, setNuovo] = useState<DettaglioNuovoArticolo | null>(null)

  // I gruppi aperti o chiusi a mano restano tali fra una visita e l'altra.
  useEffect(() => {
    try {
      setChiusi(JSON.parse(localStorage.getItem(CHIAVE_GRUPPI_CHIUSI) ?? '{}'))
    } catch {
      /* senza storage valgono i predefiniti */
    }
  }, [])

  // Qualunque schermata può aprire «Nuovo articolo» (es. «Scrivi bozza» negli hot topic).
  useEffect(() => {
    const apri = (e: Event) => setNuovo((e as CustomEvent<DettaglioNuovoArticolo>).detail ?? {})
    window.addEventListener(EVENTO_NUOVO_ARTICOLO, apri)
    return () => window.removeEventListener(EVENTO_NUOVO_ARTICOLO, apri)
  }, [])

  const chiudiNuovo = useCallback(() => setNuovo(null), [])

  const attiva = (v: VoceNav) =>
    v.esatto ? percorso === v.href : percorso === v.href || percorso.startsWith(`${v.href}/`)

  function commutaCompatta() {
    const prossima = !compatta
    setCompatta(prossima)
    document.cookie = `${COOKIE_NAV_COMPATTA}=${prossima ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`
  }

  function commutaGruppo(titolo: string, chiusoOra: boolean) {
    const prossimi = { ...chiusi, [titolo]: !chiusoOra }
    setChiusi(prossimi)
    try {
      localStorage.setItem(CHIAVE_GRUPPI_CHIUSI, JSON.stringify(prossimi))
    } catch {
      /* la scelta vale finché la pagina resta aperta */
    }
  }

  const quota = spesa ? Math.min(spesa.spesi / spesa.tetto, 1) : 0

  return (
    <>
      {navOpen && <div className="nav-esperia__velo" onClick={() => setNavOpen(false)} />}
      <aside
        className={`nav-esperia${compatta ? ' nav-esperia--compatta' : ''}`}
        aria-label="Navigazione del backoffice"
      >
        <div className="nav-esperia__testa">
          <Link href="/admin/collections/articles" className="nav-esperia__marchio" aria-label="Esperia, Articoli">
            <span className="nav-esperia__nome">Esperia</span>
            <span className="nav-esperia__monogramma" aria-hidden="true">
              E
            </span>
            <span className="nav-esperia__sottotitolo">Redazione</span>
          </Link>
          <button
            type="button"
            className="nav-esperia__tasto nav-esperia__comprimi"
            onClick={commutaCompatta}
            title={compatta ? 'Espandi la barra' : 'Comprimi la barra'}
            aria-label={compatta ? 'Espandi la barra' : 'Comprimi la barra'}
            aria-pressed={compatta}
          >
            <Icona nome="pannello" />
          </button>
          <button
            type="button"
            className="nav-esperia__tasto nav-esperia__chiudi-menu"
            onClick={() => setNavOpen(false)}
            aria-label="Chiudi il menu"
          >
            <Icona nome="chiudi" />
          </button>
        </div>

        <button
          type="button"
          className="nav-esperia__nuovo"
          onClick={() => setNuovo({})}
          title="Nuovo articolo"
        >
          <Icona nome="piu" dimensione={16} tratto={2.2} />
          <span>Nuovo articolo</span>
        </button>

        <nav className="nav-esperia__voci" aria-label="Sezioni del backoffice">
          {gruppi.map((g) => {
            const contieneAttiva = g.voci.some(attiva)
            const chiuso =
              !!g.richiudibile && !contieneAttiva && (chiusi[g.titolo] ?? true)
            return (
              <div key={g.titolo} className={`nav-esperia__gruppo${chiuso ? ' chiuso' : ''}`}>
                {g.richiudibile ? (
                  <button
                    type="button"
                    className="nav-esperia__titolo-gruppo nav-esperia__titolo-gruppo--tasto"
                    aria-expanded={!chiuso}
                    onClick={() => commutaGruppo(g.titolo, chiuso)}
                  >
                    {g.titolo}
                    <Icona nome="giu" dimensione={14} />
                  </button>
                ) : (
                  <p className="nav-esperia__titolo-gruppo">{g.titolo}</p>
                )}
                <ul>
                  {g.voci.map((v) => {
                    const on = attiva(v)
                    const titolo = v.conteggio
                      ? `${v.etichetta} · ${v.conteggio} ${v.suggerimento ?? ''}`.trim()
                      : v.etichetta
                    return (
                      <li key={v.href}>
                        <Link
                          href={v.href}
                          className="nav-esperia__voce"
                          aria-current={on ? 'page' : undefined}
                          title={titolo}
                        >
                          <Icona nome={v.icona} />
                          <span className="nav-esperia__etichetta">{v.etichetta}</span>
                          {v.conteggio ? (
                            <span
                              className={`nav-esperia__conteggio${v.evidenza ? ' nav-esperia__conteggio--evidenza' : ''}`}
                            >
                              {v.conteggio}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}

          {bozze.length > 0 && (
            <div className="nav-esperia__gruppo nav-esperia__bozze">
              <p className="nav-esperia__titolo-gruppo">In lavorazione</p>
              <ul>
                {bozze.map((b) => (
                  <li key={b.id}>
                    <Link
                      href={`/admin/collections/articles/${b.id}`}
                      className="nav-esperia__bozza"
                      aria-current={percorso.endsWith(`/articles/${b.id}`) ? 'page' : undefined}
                      title={`${b.titolo} · ${b.stato === 'in_revisione' ? 'In revisione' : 'Bozza'}`}
                    >
                      <span className={`nav-esperia__punto nav-esperia__punto--${b.stato}`} />
                      <span className="nav-esperia__etichetta">{b.titolo}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </nav>

        <div className="nav-esperia__piede">
          {spesa && (
            <Link
              href="/admin/collections/ai-usage"
              className="nav-esperia__voce nav-esperia__spesa"
              title={`Spesa AI del mese: ${euro.format(spesa.spesi)} su ${euro.format(spesa.tetto)} di tetto`}
            >
              <svg className="nav-esperia__anello" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
                <circle cx="10" cy="10" r="8" fill="none" strokeWidth="2.5" className="traccia" />
                <circle
                  cx="10"
                  cy="10"
                  r="8"
                  fill="none"
                  strokeWidth="2.5"
                  pathLength={100}
                  transform="rotate(-90 10 10)"
                  strokeDasharray={`${quota * 100} 100`}
                  className={`riempimento${quota >= 0.9 ? ' alto' : ''}`}
                />
              </svg>
              <span className="nav-esperia__etichetta">
                AI: {euro.format(spesa.spesi)} di {euro.format(spesa.tetto)}
              </span>
            </Link>
          )}
          <div className="nav-esperia__utente">
            <span className="nav-esperia__iniziali" title={utente.nome}>
              {iniziali(utente.nome)}
            </span>
            <span className="nav-esperia__dati">
              <span className="nav-esperia__persona">{utente.nome}</span>
              {utente.ruolo && <span className="nav-esperia__ruolo">{utente.ruolo}</span>}
            </span>
            <a href="/admin/logout" className="nav-esperia__tasto nav-esperia__esci" title="Esci" aria-label="Esci">
              <Icona nome="esci" dimensione={16} />
            </a>
          </div>
        </div>
      </aside>

      <NuovoArticolo aperta={nuovo !== null} iniziale={nuovo ?? NESSUN_DETTAGLIO} onChiudi={chiudiNuovo} />
    </>
  )
}

export default BarraLaterale
