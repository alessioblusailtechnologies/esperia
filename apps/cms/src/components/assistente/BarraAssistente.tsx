'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import { useForm, useFormFields } from '@payloadcms/ui'

import { Icona } from '@/components/Icona'
import { chiediIstruzione, chiediProposta, statoAssistente } from './azioni'
import {
  applicaAlCorpo,
  applicaModifica,
  blocchiCorpo,
  primoParagrafo,
  testoArticolo,
  type Bersaglio,
  type BloccoInviato,
} from './corpo'
import { abbonati, ottieniSelezione, type SelezioneSalvata } from './ponteEditor'
import { SezioneImmagini } from './SezioneImmagini'
import type {
  CampoIstruzione,
  ModificaCorpo,
  PropostaAssistente,
  Strumento,
} from '@/lib/ai/assistenza'

import './assistente.scss'
import './barra.scss'

/**
 * Barra "Assistente AI" in fondo all'articolo — RF-AI-06, RF-AI-08.
 *
 * Resta agganciata al bordo inferiore della colonna mentre si scrive: si
 * chiede a parole («accorcia il terzo paragrafo», «proponi un occhiello») o
 * con le scorciatoie sopra il campo. L'assistente propone, la redazione
 * decide: ogni proposta compare nella scheda sopra la barra accanto al testo
 * attuale e arriva nell'articolo solo con «Applica». Da lì è una modifica
 * come le altre: il salvataggio automatico della bozza la registra, e le
 * versioni di Payload fanno da rete.
 */

type Scorciatoia = Exclude<Strumento, 'istruzione'> | 'copertina'

const SCORCIATOIE: Array<{ chiave: Scorciatoia; etichetta: string }> = [
  { chiave: 'riscrivi', etichetta: 'Riscrivi' },
  { chiave: 'sintetizza', etichetta: 'Sintetizza' },
  { chiave: 'titoli', etichetta: 'Titoli alternativi' },
  { chiave: 'seo', etichetta: 'Suggerimenti SEO' },
  { chiave: 'copertina', etichetta: 'Immagine di copertina' },
]

const IN_CORSO: Record<Strumento, string> = {
  riscrivi: 'Riscrivo il passaggio…',
  sintetizza: 'Sintetizzo il passaggio…',
  titoli: 'Cerco tre titoli alternativi…',
  seo: 'Analizzo il contenuto per la SEO…',
  istruzione: 'Lavoro sulla tua richiesta…',
}

/** Dove sta, nel form, ciascun campo che l'istruzione libera può cambiare. */
const CAMPI: Record<CampoIstruzione, { path: string; nome: string }> = {
  occhiello: { path: 'kicker', nome: 'Occhiello' },
  titolo: { path: 'title', nome: 'Titolo' },
  sottotitolo: { path: 'subtitle', nome: 'Sottotitolo' },
  sommario: { path: 'excerpt', nome: 'Sommario' },
  metaTitle: { path: 'seo.metaTitle', nome: 'Meta title' },
  metaDescription: { path: 'seo.metaDescription', nome: 'Meta description' },
}

type Esito = 'applicata' | 'scartata' | 'fallita'

/** Ciò che l'istruzione libera ha letto: serve a ritrovare i blocchi quando si applica. */
interface Invio {
  richiesta: string
  blocchi: BloccoInviato[]
  selezione: SelezioneSalvata | null
}

function accorcia(testo: string, quanto = 48): string {
  const t = testo.replace(/\s+/g, ' ').trim()
  return t.length > quanto ? `${t.slice(0, quanto - 1)}…` : t
}

export function BarraAssistente() {
  const [stato, setStato] = useState<Awaited<ReturnType<typeof statoAssistente>> | null>(null)
  const [richiesta, setRichiesta] = useState('')
  const [lavoro, setLavoro] = useState<Strumento | 'copertina' | null>(null)
  const [inCorso, setInCorso] = useState(false)
  const [proposta, setProposta] = useState<PropostaAssistente | null>(null)
  const [bersaglio, setBersaglio] = useState<Bersaglio | null>(null)
  const [invio, setInvio] = useState<Invio | null>(null)
  const [esiti, setEsiti] = useState<Record<string, Esito>>({})
  const [errore, setErrore] = useState<string | null>(null)
  const [nota, setNota] = useState<string | null>(null)
  const campo = useRef<HTMLTextAreaElement>(null)

  const { dispatchFields, setModified } = useForm()
  const valori = useFormFields(([campi]) => {
    const v = {} as Record<CampoIstruzione, string>
    for (const [chiave, { path }] of Object.entries(CAMPI)) {
      v[chiave as CampoIstruzione] = String(campi[path]?.value ?? '')
    }
    return v
  })

  // La selezione nel corpo arriva dal plugin dell'editor (ponteEditor.ts).
  const selezione = useSyncExternalStore(abbonati, ottieniSelezione, () => null)
  const conSelezione = Boolean(selezione?.testo.trim())

  useEffect(() => {
    void statoAssistente().then(setStato)
  }, [])

  // Il campo cresce con il testo, fino a un tetto oltre il quale scorre.
  useEffect(() => {
    const el = campo.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
    el.style.overflowY = el.scrollHeight > 160 ? 'auto' : 'hidden'
  }, [richiesta])

  const disponibile = stato?.attivo === true
  const schedaAperta = Boolean(lavoro || errore || nota)

  function azzera() {
    setLavoro(null)
    setProposta(null)
    setBersaglio(null)
    setInvio(null)
    setEsiti({})
    setErrore(null)
    setNota(null)
  }

  async function istruisci() {
    const testo = richiesta.trim()
    if (!disponibile || inCorso || testo.length < 3) return
    azzera()
    setLavoro('istruzione')

    const sel = ottieniSelezione()
    const selezioneValida = sel?.testo.trim() ? sel : null
    const blocchi = blocchiCorpo()
    setInvio({ richiesta: testo, blocchi, selezione: selezioneValida })
    setInCorso(true)
    const esito = await chiediIstruzione({
      istruzione: testo,
      passaggio: selezioneValida?.testo ?? '',
      blocchi: blocchi.map(({ chiave: _chiave, ...b }) => b),
      campi: valori,
      titolo: valori.titolo,
    })
    setInCorso(false)

    if (!esito.ok) {
      setLavoro(null)
      setErrore(esito.messaggio)
      return
    }
    setRichiesta('')
    setProposta(esito.dati)
  }

  async function scorciatoia(chiave: Scorciatoia) {
    if (!disponibile || inCorso) return
    azzera()
    if (chiave === 'copertina') {
      setLavoro('copertina')
      return
    }
    setLavoro(chiave)

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
          setLavoro(null)
          setErrore('Il corpo è vuoto: scrivi almeno un paragrafo.')
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
      titolo: valori.titolo,
    })
    setInCorso(false)

    if (!esito.ok) {
      setLavoro(null)
      setErrore(esito.messaggio)
      return
    }
    setProposta(esito.dati)
  }

  function impostaCampo(path: string, valore: string) {
    dispatchFields({ type: 'UPDATE', path, value: valore })
    setModified(true)
  }

  function accettaTesto() {
    if (!proposta || !bersaglio || !('testo' in proposta)) return
    const riuscito = applicaAlCorpo(bersaglio, proposta.testo)
    azzera()
    if (riuscito) setNota('Proposta applicata · da rileggere prima di salvare')
    else setErrore('Il passaggio è cambiato da quando l’hai inviato all’assistente: rilancia.')
  }

  function applica(i: number, m: ModificaCorpo) {
    if (!invio) return
    const ok = applicaModifica(m, invio.blocchi, invio.selezione)
    setEsiti((e) => ({ ...e, [`m${i}`]: ok ? 'applicata' : 'fallita' }))
  }

  function usaCampo(i: number, c: { campo: CampoIstruzione; valore: string }) {
    impostaCampo(CAMPI[c.campo].path, c.valore)
    setEsiti((e) => ({ ...e, [`c${i}`]: 'applicata' }))
  }

  function scarta(chiave: string) {
    setEsiti((e) => ({ ...e, [chiave]: 'scartata' }))
  }

  function applicaTutto() {
    if (proposta?.strumento !== 'istruzione') return
    proposta.modifiche.forEach((m, i) => {
      if (!esiti[`m${i}`]) applica(i, m)
    })
    proposta.campi.forEach((c, i) => {
      if (!esiti[`c${i}`]) usaCampo(i, c)
    })
  }

  function tasto(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void istruisci()
    }
    if (e.key === 'Escape' && schedaAperta && !inCorso) azzera()
  }

  /* --------------------------------------------------------- scheda proposta */

  function originale(m: ModificaCorpo): string | null {
    if (m.blocco === 0) return m.azione === 'sostituisci' ? (invio?.selezione?.testo ?? null) : null
    return invio?.blocchi.find((b) => b.n === m.blocco)?.testo ?? null
  }

  function etichettaModifica(m: ModificaCorpo): string {
    if (m.blocco === 0) return m.azione === 'sostituisci' ? 'Selezione' : 'Nuovo paragrafo in testa'
    if (m.azione === 'inserisci_dopo') return `Nuovo paragrafo dopo il ${m.blocco}`
    const tipo = invio?.blocchi.find((b) => b.n === m.blocco)?.tipo ?? 'paragrafo'
    const nome = `${tipo.charAt(0).toUpperCase()}${tipo.slice(1)} ${m.blocco}`
    return m.azione === 'elimina' ? `${nome} · da togliere` : nome
  }

  function decisione(chiave: string, onApplica: () => void, etichetta = 'Applica') {
    const esito = esiti[chiave]
    if (esito) {
      return (
        <span className={`barra-ai__esito barra-ai__esito--${esito}`}>
          {esito === 'applicata'
            ? '✓ Applicata'
            : esito === 'scartata'
              ? 'Scartata'
              : 'Il testo è cambiato: non applicata'}
        </span>
      )
    }
    return (
      <span className="barra-ai__scelte">
        <button type="button" className="barra-ai__applica" onClick={onApplica}>
          {etichetta}
        </button>
        <button type="button" className="barra-ai__scarta" onClick={() => scarta(chiave)}>
          Scarta
        </button>
      </span>
    )
  }

  function contenutoProposta() {
    if (!proposta) return null

    if (proposta.strumento === 'istruzione') {
      const quante = proposta.modifiche.length + proposta.campi.length
      const restanti =
        proposta.modifiche.filter((_, i) => !esiti[`m${i}`]).length +
        proposta.campi.filter((_, i) => !esiti[`c${i}`]).length
      return (
        <>
          {proposta.risposta && <p className="barra-ai__risposta">{proposta.risposta}</p>}
          {proposta.campi.map((c, i) => (
            <div key={`c${i}`} className="barra-ai__modifica">
              <div className="barra-ai__modifica-testa">
                <span className="barra-ai__dove">{CAMPI[c.campo].nome}</span>
                {decisione(`c${i}`, () => usaCampo(i, c), 'Usa')}
              </div>
              {valori[c.campo] && <p className="barra-ai__prima">{valori[c.campo]}</p>}
              <p className="barra-ai__dopo">{c.valore}</p>
            </div>
          ))}
          {proposta.modifiche.map((m, i) => {
            const prima = originale(m)
            return (
              <div key={`m${i}`} className="barra-ai__modifica">
                <div className="barra-ai__modifica-testa">
                  <span className="barra-ai__dove">{etichettaModifica(m)}</span>
                  {decisione(`m${i}`, () => applica(i, m))}
                </div>
                {prima && <p className="barra-ai__prima">{prima}</p>}
                {m.azione !== 'elimina' && <p className="barra-ai__dopo">{m.testo}</p>}
              </div>
            )
          })}
          {quante > 1 && restanti > 0 && (
            <div className="barra-ai__decisione">
              <button type="button" className="assistente__accetta" onClick={applicaTutto}>
                Applica tutto ({restanti})
              </button>
            </div>
          )}
          {quante > 0 && (
            <p className="assistente__piede">
              Le modifiche applicate entrano nella bozza come se le avessi scritte tu: rileggile.
              Ctrl+Z nel corpo annulla.
            </p>
          )}
        </>
      )
    }

    if (proposta.strumento === 'titoli') {
      return (
        <div className="assistente__elenco">
          {proposta.titoli.map((t, i) => (
            <div key={i} className="assistente__voce">
              <span className="assistente__voce-testo">{t}</span>
              {decisione(
                `t${i}`,
                () => {
                  impostaCampo('title', t)
                  setEsiti((e) => ({ ...e, [`t${i}`]: 'applicata' }))
                },
                'Usa come titolo',
              )}
            </div>
          ))}
        </div>
      )
    }

    if (proposta.strumento === 'seo') {
      return (
        <div className="assistente__elenco">
          {(
            [
              ['metaTitle', 'Meta title', proposta.metaTitle],
              ['metaDescription', 'Meta description', proposta.metaDescription],
            ] as const
          ).map(([chiave, nome, valore]) => (
            <div key={chiave} className="assistente__voce">
              <span className="assistente__voce-testo">
                <strong>{nome}:</strong> {valore}
              </span>
              {decisione(
                chiave,
                () => {
                  impostaCampo(CAMPI[chiave].path, valore)
                  setEsiti((e) => ({ ...e, [chiave]: 'applicata' }))
                },
                'Usa',
              )}
            </div>
          ))}
          {proposta.suggerimenti.map((s, i) => (
            <div key={i} className="assistente__voce">
              <span className="assistente__voce-testo">{s}</span>
            </div>
          ))}
        </div>
      )
    }

    // Riscrittura o sintesi del passaggio.
    if (!bersaglio) return null
    return (
      <>
        <div className="barra-ai__modifica">
          <p className="barra-ai__prima">
            {bersaglio.tipo === 'selezione' ? bersaglio.selezione.testo : bersaglio.testo}
          </p>
          <p className="barra-ai__dopo">{proposta.testo}</p>
        </div>
        <div className="barra-ai__decisione">
          <button type="button" className="assistente__accetta" onClick={accettaTesto}>
            Applica e sostituisci
          </button>
          <button type="button" className="assistente__rifiuta" onClick={azzera}>
            Scarta
          </button>
        </div>
      </>
    )
  }

  function titoloScheda(): string {
    if (lavoro === 'copertina') return 'Immagine di copertina'
    if (lavoro === 'istruzione') return invio ? `«${accorcia(invio.richiesta, 70)}»` : 'Richiesta'
    if (lavoro === 'titoli') return 'Tre titoli alternativi'
    if (lavoro === 'seo') return 'Suggerimenti SEO'
    if (lavoro === 'riscrivi' || lavoro === 'sintetizza') {
      const cosa = lavoro === 'sintetizza' ? 'Sintesi' : 'Riscrittura'
      return bersaglio?.tipo === 'selezione'
        ? `${cosa} della selezione`
        : `${cosa} del primo paragrafo`
    }
    return 'Assistente'
  }

  /* ------------------------------------------------------------------ resa */

  return (
    <div className="barra-ai" role="region" aria-label="Assistente AI">
      {schedaAperta && (
        <div className="barra-ai__scheda" aria-live="polite">
          {lavoro && (
            <div className="barra-ai__scheda-testa">
              <span className="assistente__marchio">AI</span>
              <span className="barra-ai__scheda-titolo">{titoloScheda()}</span>
              {!inCorso && (
                <button
                  type="button"
                  className="barra-ai__chiudi"
                  aria-label="Chiudi la proposta"
                  onClick={azzera}
                >
                  <Icona nome="chiudi" dimensione={14} />
                </button>
              )}
            </div>
          )}

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

          {inCorso && lavoro && lavoro !== 'copertina' && (
            <div className="assistente__attesa">
              <div className="assistente__attesa-riga">
                <span className="assistente__pulsazione" aria-hidden="true" />
                <span>{IN_CORSO[lavoro]}</span>
              </div>
              <span className="assistente__barra" />
              <span className="assistente__barra assistente__barra--86" />
              <span className="assistente__barra assistente__barra--64" />
            </div>
          )}

          {lavoro === 'copertina' && <SezioneImmagini stato={stato?.immagini ?? null} />}

          {!inCorso && proposta && <div className="barra-ai__proposta">{contenutoProposta()}</div>}

          {(errore || nota) && !lavoro && (
            <button
              type="button"
              className="barra-ai__chiudi barra-ai__chiudi--angolo"
              aria-label="Chiudi"
              onClick={azzera}
            >
              <Icona nome="chiudi" dimensione={14} />
            </button>
          )}
        </div>
      )}

      {stato && !disponibile ? (
        <div className="barra-ai__spenta" role="status">
          <Icona nome="ai" dimensione={16} />
          <span>
            Assistente non disponibile. {stato.messaggio} L’articolo si scrive e si salva
            normalmente.
          </span>
        </div>
      ) : (
        <div className={`barra-ai__campo${inCorso ? ' barra-ai__campo--attesa' : ''}`}>
          <div className="barra-ai__scorciatoie" role="group" aria-label="Scorciatoie">
            <span
              className={`barra-ai__ambito${conSelezione ? ' barra-ai__ambito--selezione' : ''}`}
            >
              {conSelezione && selezione
                ? `Selezione: «${accorcia(selezione.testo, 32)}»`
                : 'Tutto l’articolo'}
            </span>
            {SCORCIATOIE.map((s) => (
              <button
                key={s.chiave}
                type="button"
                className="barra-ai__pastiglia"
                aria-pressed={lavoro === s.chiave}
                disabled={!disponibile || inCorso}
                onClick={() => void scorciatoia(s.chiave)}
              >
                {s.etichetta}
              </button>
            ))}
          </div>
          <div className="barra-ai__riga">
            <span className="barra-ai__icona" aria-hidden="true">
              <Icona nome="ai" dimensione={18} />
            </span>
            <textarea
              ref={campo}
              className="barra-ai__testo"
              rows={1}
              value={richiesta}
              disabled={!disponibile}
              aria-label="Chiedi all’assistente"
              placeholder={
                conSelezione
                  ? 'Cosa faccio con la selezione? Es. «rendila più asciutta»'
                  : 'Chiedi all’assistente… Es. «accorcia il terzo paragrafo», «proponi un occhiello»'
              }
              onChange={(e) => setRichiesta(e.currentTarget.value)}
              onKeyDown={tasto}
            />
            <button
              type="button"
              className="barra-ai__invia"
              aria-label="Invia la richiesta"
              disabled={!disponibile || inCorso || richiesta.trim().length < 3}
              onClick={() => void istruisci()}
            >
              <Icona nome="invia" dimensione={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default BarraAssistente
