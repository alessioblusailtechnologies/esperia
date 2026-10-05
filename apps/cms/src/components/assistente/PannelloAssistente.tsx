'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useForm, useFormFields } from '@payloadcms/ui'

import { chiediProposta, statoAssistente } from './azioni'
import { applicaAlCorpo, primoParagrafo, testoArticolo, type Bersaglio } from './corpo'
import { abbonati, ottieniSelezione } from './ponteEditor'
import { SezioneImmagini } from './SezioneImmagini'
import type { PropostaAssistente, Strumento } from '@/lib/ai/assistenza'

import './assistente.scss'

/**
 * Pannello "Assistente AI" nella colonna dell'editor — RF-AI-06, RF-AI-08.
 * Impaginazione e testi dai design (Editor v1, blocco Assistente AI).
 *
 * L'assistente propone, la redazione decide: ogni proposta compare accanto al
 * testo attuale e arriva nell'articolo solo con "Accetta". Anche allora entra
 * nell'editor aperto, non nel database: resta da rileggere e salvare come
 * qualunque altra modifica, con le versioni di Payload a fare da rete.
 */

const STRUMENTI: Array<{ chiave: Strumento; etichetta: string }> = [
  { chiave: 'riscrivi', etichetta: 'Riscrivi' },
  { chiave: 'sintetizza', etichetta: 'Sintetizza' },
  { chiave: 'titoli', etichetta: 'Titoli alternativi' },
  { chiave: 'seo', etichetta: 'Suggerimenti SEO' },
]

const IN_CORSO: Record<Strumento, string> = {
  riscrivi: 'Elaborazione della proposta…',
  sintetizza: 'Elaborazione della proposta…',
  titoli: 'Elaborazione dei titoli proposti…',
  seo: 'Analisi SEO del contenuto…',
}

export function PannelloAssistente() {
  const [aperto, setAperto] = useState(true)
  const [stato, setStato] = useState<Awaited<ReturnType<typeof statoAssistente>> | null>(null)

  const [strumento, setStrumento] = useState<Strumento | null>(null)
  const [inCorso, setInCorso] = useState(false)
  const [proposta, setProposta] = useState<PropostaAssistente | null>(null)
  const [bersaglio, setBersaglio] = useState<Bersaglio | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [nota, setNota] = useState<string | null>(null)

  const { dispatchFields, setModified } = useForm()
  const titolo = useFormFields(([campi]) => String(campi.title?.value ?? ''))

  // La selezione nel corpo arriva dal plugin dell'editor (ponteEditor.ts).
  const selezione = useSyncExternalStore(abbonati, ottieniSelezione, () => null)
  const conSelezione = Boolean(selezione?.testo.trim())

  useEffect(() => {
    void statoAssistente().then(setStato)
  }, [])

  const disponibile = stato?.attivo === true

  async function esegui(chiave: Strumento) {
    if (!disponibile || inCorso) return
    setErrore(null)
    setNota(null)
    setProposta(null)
    setStrumento(chiave)

    let passaggio = ''
    let nuovoBersaglio: Bersaglio | null = null
    if (chiave === 'riscrivi' || chiave === 'sintetizza') {
      const sel = ottieniSelezione()
      if (sel && sel.testo.trim()) {
        nuovoBersaglio = { tipo: 'selezione', selezione: sel }
        passaggio = sel.testo
      } else {
        const primo = primoParagrafo()
        if (!primo) {
          setErrore('Il corpo è vuoto: scrivi almeno un paragrafo.')
          setStrumento(null)
          return
        }
        nuovoBersaglio = { tipo: 'paragrafo', ...primo }
        passaggio = primo.testo
      }
    }

    setBersaglio(nuovoBersaglio)
    setInCorso(true)
    const esito = await chiediProposta({
      strumento: chiave,
      passaggio,
      articolo: testoArticolo(),
      titolo,
    })
    setInCorso(false)

    if (!esito.ok) {
      setErrore(esito.messaggio)
      setStrumento(null)
      return
    }
    setProposta(esito.dati)
  }

  function chiudi() {
    setStrumento(null)
    setProposta(null)
    setBersaglio(null)
  }

  function impostaCampo(path: string, valore: string, conferma: string) {
    dispatchFields({ type: 'UPDATE', path, value: valore })
    setModified(true)
    setNota(conferma)
  }

  function accettaTesto() {
    if (!proposta || !bersaglio || !('testo' in proposta)) return
    if (applicaAlCorpo(bersaglio, proposta.testo)) {
      chiudi()
      setNota('Proposta accettata · da rileggere prima di salvare')
    } else {
      setErrore(
        'Il passaggio è cambiato da quando l’hai inviato all’assistente: rilancia lo strumento.',
      )
      chiudi()
    }
  }

  const titoloProposta =
    proposta?.strumento === 'titoli'
      ? 'Tre titoli alternativi'
      : proposta?.strumento === 'seo'
        ? 'Suggerimenti sul contenuto'
        : bersaglio?.tipo === 'selezione'
          ? `${proposta?.strumento === 'sintetizza' ? 'Sintesi' : 'Riscrittura'} della selezione`
          : `${proposta?.strumento === 'sintetizza' ? 'Sintesi' : 'Riscrittura'} del primo paragrafo`

  return (
    <div className="assistente">
      <button
        type="button"
        className="assistente__testata"
        onClick={() => setAperto((a) => !a)}
        aria-expanded={aperto}
      >
        <span className="assistente__titolo">Assistente AI</span>
        <span className="assistente__beta">BETA</span>
        <span className="assistente__chevron" aria-hidden="true">
          {aperto ? '▴' : '▾'}
        </span>
      </button>

      {aperto && (
        <div className="assistente__corpo">
          <p className="assistente__principio">
            L’assistente propone, la redazione decide: ogni risultato compare accanto al testo
            attuale e va accettato o rifiutato a mano.
          </p>

          {stato && !stato.attivo && (
            <div className="assistente__spento" role="status">
              <div className="assistente__spento-testata">
                <span className="assistente__spento-icona" aria-hidden="true">
                  !
                </span>
                <span>Assistente non disponibile</span>
              </div>
              <p>
                {stato.messaggio} Scrittura, salvataggio, pianificazione e pubblicazione
                dell’articolo funzionano normalmente.
              </p>
            </div>
          )}

          <div className="assistente__strumenti">
            <div className="assistente__riga">
              <span className="assistente__etichetta">Strumenti sul testo</span>
              <span className="assistente__stato">
                {stato === null
                  ? 'stato: verifica…'
                  : disponibile
                    ? 'stato: attivo'
                    : 'stato: non disponibile'}
              </span>
            </div>
            <p className="assistente__ambito">
              {conSelezione
                ? 'agisce sulla selezione corrente nel corpo'
                : 'nessuna selezione: agisce sul primo paragrafo del corpo'}
            </p>
            <div className="assistente__griglia">
              {STRUMENTI.map((s) => (
                <button
                  key={s.chiave}
                  type="button"
                  className={`assistente__strumento${strumento === s.chiave ? ' assistente__strumento--attivo' : ''}`}
                  disabled={!disponibile || inCorso}
                  onClick={() => void esegui(s.chiave)}
                >
                  {s.etichetta}
                </button>
              ))}
            </div>
          </div>

          {errore && (
            <p className="assistente__errore" role="alert">
              {errore}
            </p>
          )}
          {nota && (
            <p className="assistente__nota" role="status">
              {nota}
            </p>
          )}

          {inCorso && strumento && (
            <div className="assistente__attesa" aria-live="polite">
              <div className="assistente__attesa-riga">
                <span className="assistente__pulsazione" aria-hidden="true" />
                <span>{IN_CORSO[strumento]}</span>
              </div>
              <span className="assistente__barra" />
              <span className="assistente__barra assistente__barra--86" />
              <span className="assistente__barra assistente__barra--64" />
            </div>
          )}

          {proposta && (
            <div className="assistente__proposta">
              <div className="assistente__riga">
                <span className="assistente__marchio">PROPOSTA</span>
                <span className="assistente__titolo-proposta">{titoloProposta}</span>
              </div>

              {proposta.strumento === 'titoli' && (
                <div className="assistente__elenco">
                  {proposta.titoli.map((t, i) => (
                    <div key={i} className="assistente__voce">
                      <span className="assistente__voce-testo">{t}</span>
                      <button
                        type="button"
                        className="assistente__azione"
                        onClick={() => impostaCampo('title', t, 'Titolo sostituito · da rileggere')}
                      >
                        Usa come titolo
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {proposta.strumento === 'seo' && (
                <div className="assistente__elenco">
                  <div className="assistente__voce">
                    <span className="assistente__voce-testo">
                      <strong>Meta title:</strong> {proposta.metaTitle}
                    </span>
                    <button
                      type="button"
                      className="assistente__azione"
                      onClick={() =>
                        impostaCampo('seo.metaTitle', proposta.metaTitle, 'Meta title aggiornato')
                      }
                    >
                      Usa
                    </button>
                  </div>
                  <div className="assistente__voce">
                    <span className="assistente__voce-testo">
                      <strong>Meta description:</strong> {proposta.metaDescription}
                    </span>
                    <button
                      type="button"
                      className="assistente__azione"
                      onClick={() =>
                        impostaCampo(
                          'seo.metaDescription',
                          proposta.metaDescription,
                          'Meta description aggiornata',
                        )
                      }
                    >
                      Usa
                    </button>
                  </div>
                  {proposta.suggerimenti.map((s, i) => (
                    <div key={i} className="assistente__voce">
                      <span className="assistente__voce-testo">{s}</span>
                    </div>
                  ))}
                </div>
              )}

              {(proposta.strumento === 'riscrivi' || proposta.strumento === 'sintetizza') &&
                bersaglio && (
                  <div className="assistente__confronto">
                    <span className="assistente__confronto-etichetta">TESTO ATTUALE</span>
                    <p className="assistente__attuale">
                      {bersaglio.tipo === 'selezione' ? bersaglio.selezione.testo : bersaglio.testo}
                    </p>
                    <span className="assistente__confronto-etichetta assistente__confronto-etichetta--proposta">
                      PROPOSTA
                    </span>
                    <p className="assistente__proposto">{proposta.testo}</p>
                  </div>
                )}

              <div className="assistente__decisione">
                {'testo' in proposta && (
                  <button type="button" className="assistente__accetta" onClick={accettaTesto}>
                    Accetta e sostituisci
                  </button>
                )}
                <button type="button" className="assistente__rifiuta" onClick={chiudi}>
                  {'testo' in proposta ? 'Rifiuta' : 'Chiudi'}
                </button>
              </div>
              <p className="assistente__piede">
                Niente viene applicato al pezzo finché non premi «
                {'testo' in proposta ? 'Accetta' : 'Usa'}»: il rifiuto lascia il testo intatto.
              </p>
            </div>
          )}
          <SezioneImmagini stato={stato?.immagini ?? null} />
        </div>
      )}
    </div>
  )
}
