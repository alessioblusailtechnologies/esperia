'use client'

import { useMemo, useState, useTransition } from 'react'
import { REPORT_REASON_LABELS } from '@esperia/shared'

import type { VoceModerazione } from '@/lib/supabase'
import {
  approvaCommento,
  bloccaAutore,
  decidiInBlocco,
  eliminaCommento,
  rifiutaCommento,
} from './azioni'

/**
 * Coda di moderazione — impaginazione dai design (Moderazione v1).
 *
 * Ogni scheda mostra il commento con tutto il contesto necessario a decidere:
 * chi l'ha scritto e da quanto è iscritto, a cosa risponde, su quale articolo
 * sta, e — nelle segnalazioni — perché è stato segnalato e da chi.
 */

const quando = new Intl.RelativeTimeFormat('it-IT', { numeric: 'auto' })
const dataIscrizione = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' })

function fa(iso: string): string {
  const minuti = Math.round((new Date(iso).getTime() - Date.now()) / 60_000)
  if (Math.abs(minuti) < 60) return quando.format(minuti, 'minute')
  const ore = Math.round(minuti / 60)
  if (Math.abs(ore) < 24) return quando.format(ore, 'hour')
  return quando.format(Math.round(ore / 24), 'day')
}

type Scheda = 'attesa' | 'segnalazioni'

export function CodaModerazione({
  inAttesa,
  segnalazioni,
}: {
  inAttesa: VoceModerazione[]
  segnalazioni: VoceModerazione[]
}) {
  const [scheda, setScheda] = useState<Scheda>(
    // Se ci sono segnalazioni aperte è lì che serve l'attenzione per prima.
    segnalazioni.length > 0 && inAttesa.length === 0 ? 'segnalazioni' : 'attesa',
  )
  const [selezione, setSelezione] = useState<Set<string>>(new Set())
  const [risolti, setRisolti] = useState<Set<string>>(new Set())
  const [messaggio, setMessaggio] = useState<{ tipo: 'ok' | 'errore'; testo: string } | null>(null)
  const [blocco, setBlocco] = useState<VoceModerazione | null>(null)
  const [motivoBlocco, setMotivoBlocco] = useState('')
  const [inCorso, avvia] = useTransition()

  const voci = useMemo(
    () => (scheda === 'attesa' ? inAttesa : segnalazioni).filter((v) => !risolti.has(v.id)),
    [scheda, inAttesa, segnalazioni, risolti],
  )

  function segnaRisolto(id: string) {
    setRisolti((p) => new Set(p).add(id))
    setSelezione((p) => {
      const n = new Set(p)
      n.delete(id)
      return n
    })
  }

  function esegui(
    azione: () => Promise<{ ok: boolean; messaggio?: string }>,
    idRisolto: string | null,
    successo: string,
  ) {
    avvia(async () => {
      const esito = await azione()
      if (esito.ok) {
        if (idRisolto) segnaRisolto(idRisolto)
        setMessaggio({ tipo: 'ok', testo: successo })
      } else {
        setMessaggio({ tipo: 'errore', testo: esito.messaggio ?? 'Operazione non riuscita.' })
      }
    })
  }

  function inBlocco(decisione: 'approvato' | 'rifiutato' | 'eliminato', etichetta: string) {
    const ids = [...selezione]
    if (ids.length === 0) return
    avvia(async () => {
      const esito = await decidiInBlocco(ids, decisione)
      for (const id of ids) segnaRisolto(id)
      setMessaggio(
        esito.ok
          ? { tipo: 'ok', testo: `${etichetta}: ${ids.length} commenti.` }
          : { tipo: 'errore', testo: esito.messaggio ?? 'Operazione parzialmente riuscita.' },
      )
    })
  }

  const tutteSelezionate = voci.length > 0 && voci.every((v) => selezione.has(v.id))

  return (
    <div className="moderazione">
      <div className="moderazione__schede" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={scheda === 'attesa'}
          className={`scheda${scheda === 'attesa' ? ' scheda--attiva' : ''}`}
          onClick={() => setScheda('attesa')}
        >
          Commenti in attesa · {inAttesa.filter((v) => !risolti.has(v.id)).length}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={scheda === 'segnalazioni'}
          className={`scheda${scheda === 'segnalazioni' ? ' scheda--attiva' : ''}`}
          onClick={() => setScheda('segnalazioni')}
        >
          Segnalazioni ricevute · {segnalazioni.filter((v) => !risolti.has(v.id)).length}
        </button>
      </div>

      {messaggio && (
        <p
          className={`moderazione__messaggio moderazione__messaggio--${messaggio.tipo}`}
          role="status"
        >
          {messaggio.testo}
        </p>
      )}

      {selezione.size > 0 && (
        <div className="barra-selezione">
          <span className="barra-selezione__conteggio">
            {selezione.size} {selezione.size === 1 ? 'commento' : 'commenti'} selezionati
          </span>
          <button type="button" disabled={inCorso} onClick={() => inBlocco('approvato', 'Approvati')}>
            Approva
          </button>
          <button type="button" disabled={inCorso} onClick={() => inBlocco('rifiutato', 'Rifiutati')}>
            Rifiuta
          </button>
          <button
            type="button"
            className="barra-selezione__pericolo"
            disabled={inCorso}
            onClick={() => inBlocco('eliminato', 'Eliminati')}
          >
            Elimina
          </button>
          <button
            type="button"
            className="barra-selezione__annulla"
            onClick={() => setSelezione(new Set())}
          >
            Deseleziona
          </button>
        </div>
      )}

      <div className="moderazione__intestazione">
        <label className="spunta-tutto">
          <input
            type="checkbox"
            checked={tutteSelezionate}
            onChange={(e) =>
              setSelezione(e.currentTarget.checked ? new Set(voci.map((v) => v.id)) : new Set())
            }
          />
          Seleziona tutto
        </label>
        <span className="moderazione__conteggio">
          {voci.length === 0
            ? 'coda vuota'
            : `${voci.length} ${voci.length === 1 ? 'elemento' : 'elementi'} in coda`}
        </span>
      </div>

      {voci.length === 0 ? (
        <div className="moderazione__vuoto">
          <h2>
            {scheda === 'attesa' ? 'Nessun commento in attesa' : 'Nessuna segnalazione aperta'}
          </h2>
          <p>
            {scheda === 'attesa'
              ? 'Tutti i commenti ricevuti sono stati esaminati. I nuovi arrivano qui appena vengono scritti.'
              : 'Nessun lettore ha segnalato contenuti da esaminare.'}
          </p>
        </div>
      ) : (
        voci.map((v) => (
          <article key={v.id} className="commento-mod">
            <input
              type="checkbox"
              className="commento-mod__spunta"
              aria-label={`Seleziona il commento di ${v.autore?.displayName ?? 'utente rimosso'}`}
              checked={selezione.has(v.id)}
              onChange={(e) =>
                setSelezione((p) => {
                  const n = new Set(p)
                  if (e.currentTarget.checked) n.add(v.id)
                  else n.delete(v.id)
                  return n
                })
              }
            />

            <div className="commento-mod__corpo">
              <header className="commento-mod__testata">
                <span className="avatar-mod" aria-hidden="true" />
                <span className="commento-mod__autore">
                  <span className="commento-mod__nome">
                    {v.autore?.displayName ?? 'Utente rimosso'}
                    {v.autore?.isStaff && <span className="distintivo">Redazione</span>}
                    {v.autore?.bannedAt && <span className="distintivo distintivo--bloccato">Bloccato</span>}
                  </span>
                  <span className="commento-mod__storia">
                    {v.autore
                      ? `iscritto ${dataIscrizione.format(new Date(v.autore.iscrittoIl))}`
                      : 'profilo non più disponibile'}
                  </span>
                </span>
                <span className="commento-mod__quando">{fa(v.creatoIl)}</span>
                {v.autoFlagged && (
                  <span className="distintivo distintivo--auto">
                    Segnalato in automatico{v.autoFlagReason ? `: ${v.autoFlagReason}` : ''}
                  </span>
                )}
              </header>

              {v.segnalazione && (
                <div className="motivazione">
                  <span className="motivazione__etichetta">Motivazione</span>
                  <span className="motivazione__valore">
                    {REPORT_REASON_LABELS[v.segnalazione.motivo]}
                  </span>
                  <span className="motivazione__chi">
                    · segnalato da {v.segnalazione.segnalatoDa ?? 'utente rimosso'}
                    {v.segnalazione.nota ? ` — «${v.segnalazione.nota}»` : ''}
                  </span>
                </div>
              )}

              {v.genitore && (
                <div className="genitore">
                  <span className="genitore__etichetta">
                    In risposta a {v.genitore.autore ?? 'utente rimosso'}
                  </span>
                  <span className="genitore__testo">{v.genitore.testo}</span>
                </div>
              )}

              <p className="commento-mod__testo">{v.testo}</p>

              <p className="commento-mod__articolo">
                <span className="commento-mod__su">Su</span>
                {v.articoloSlug ? (
                  <a href={`/${v.articoloSlug}`} target="_blank" rel="noopener noreferrer">
                    {v.articoloTitolo} ↗
                  </a>
                ) : (
                  <span className="commento-mod__orfano">
                    articolo non più disponibile ({v.articleId.slice(0, 8)}…)
                  </span>
                )}
                {v.articoloCategoria && <span> · {v.articoloCategoria}</span>}
              </p>

              <footer className="commento-mod__azioni">
                <button
                  type="button"
                  className="azione azione--primaria"
                  disabled={inCorso}
                  onClick={() =>
                    esegui(() => approvaCommento(v.id, v.testo.slice(0, 60)), v.id, 'Commento approvato.')
                  }
                >
                  Approva
                </button>
                <button
                  type="button"
                  className="azione"
                  disabled={inCorso}
                  onClick={() =>
                    esegui(() => rifiutaCommento(v.id, v.testo.slice(0, 60)), v.id, 'Commento rifiutato.')
                  }
                >
                  Rifiuta
                </button>
                <button
                  type="button"
                  className="azione azione--pericolo"
                  disabled={inCorso}
                  onClick={() =>
                    esegui(() => eliminaCommento(v.id, v.testo.slice(0, 60)), v.id, 'Commento eliminato.')
                  }
                >
                  Elimina
                </button>
                {v.autore && !v.autore.bannedAt && (
                  <button
                    type="button"
                    className="azione azione--tenue"
                    disabled={inCorso}
                    onClick={() => {
                      setBlocco(v)
                      setMotivoBlocco('')
                    }}
                  >
                    Blocca utente
                  </button>
                )}
                <span className="commento-mod__nota">
                  Il commento resta invisibile sul portale finché non lo approvi.
                </span>
              </footer>
            </div>
          </article>
        ))
      )}

      {/* ---------- Pannello di blocco utente ---------- */}
      {blocco?.autore && (
        <div
          className="velo-mod"
          onClick={(e) => e.target === e.currentTarget && setBlocco(null)}
        >
          <div className="pannello-blocco" role="dialog" aria-modal="true" aria-labelledby="tb">
            <h2 id="tb">Blocca {blocco.autore.displayName}</h2>
            <p className="pannello-blocco__testo">
              L’utente non potrà più scrivere commenti né reazioni. I commenti già approvati
              restano visibili: rimuoverli è una decisione separata.
            </p>

            <label className="pannello-blocco__campo">
              <span>Motivazione (resta agli atti nel registro operazioni)</span>
              <textarea
                value={motivoBlocco}
                rows={3}
                onChange={(e) => setMotivoBlocco(e.currentTarget.value)}
                placeholder="Es. reiterate offese personali dopo due richiami"
              />
            </label>

            <div className="pannello-blocco__azioni">
              <button type="button" className="azione" onClick={() => setBlocco(null)}>
                Annulla
              </button>
              <button
                type="button"
                className="azione azione--primaria"
                disabled={inCorso || motivoBlocco.trim().length === 0}
                onClick={() => {
                  const autore = blocco.autore!
                  esegui(
                    () => bloccaAutore(autore.id, autore.displayName, motivoBlocco),
                    null,
                    `${autore.displayName} è stato bloccato.`,
                  )
                  setBlocco(null)
                }}
              >
                Blocca utente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CodaModerazione
