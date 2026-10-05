'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { Icona } from '@/components/Icona'
import {
  datiNuovoArticolo,
  scriviBozzaAi,
  type DatiNuovoArticolo,
} from '@/components/views/azioniAi'
import type { DettaglioNuovoArticolo } from './costanti'

import './NuovoArticolo.scss'

/**
 * Finestra «Nuovo articolo» — l'unico punto da cui nasce un pezzo.
 *
 * Tre partenze: foglio bianco, i propri appunti, un hot topic. Le ultime due
 * passano dall'AI, e la finestra lo dice in chiaro con i due riquadri «L'AI
 * fa» / «Tu fai» prima di qualsiasi generazione. Il risultato non è una
 * proposta da accettare qui: è una bozza a nome di chi l'ha chiesta, aperta
 * subito nell'editor, con la lista dei punti da verificare in cima alla
 * colonna.
 */

type Passo = 'scelta' | 'appunti' | 'argomento' | 'lavoro'

const LUNGHEZZE = [
  { chiave: 'breve', etichetta: 'Breve · 350' },
  { chiave: 'media', etichetta: 'Media · 700' },
  { chiave: 'lunga', etichetta: 'Lunga · 1.300' },
]

const TAGLI = ['Cronaca dei fatti', 'Che cosa cambia', 'Analisi e contesto', 'Le reazioni']

const FASI = [
  { testo: 'Leggo il materiale di partenza', chi: 'AI' },
  { testo: 'Scrivo titolo, sommario e corpo', chi: 'AI' },
  { testo: 'Segno cosa va verificato', chi: 'AI' },
  { testo: 'Apro la bozza a tuo nome', chi: 'Esperia' },
]

export function NuovoArticolo({
  aperta,
  iniziale,
  onChiudi,
}: {
  aperta: boolean
  iniziale: DettaglioNuovoArticolo
  onChiudi: () => void
}) {
  const [passo, setPasso] = useState<Passo>('scelta')
  const [dati, setDati] = useState<DatiNuovoArticolo | null>(null)
  const [erroreDati, setErroreDati] = useState<string | null>(null)

  const [appunti, setAppunti] = useState('')
  const [indicazioni, setIndicazioni] = useState('')
  const [argomento, setArgomento] = useState<string | null>(null)
  const [categoria, setCategoria] = useState('')
  const [lunghezza, setLunghezza] = useState('media')
  const [taglio, setTaglio] = useState<string | null>(null)

  const [fase, setFase] = useState(0)
  const [errore, setErrore] = useState<string | null>(null)
  const riquadro = useRef<HTMLDivElement>(null)
  const passoPrecedente = useRef<Passo>('appunti')

  // A ogni apertura si riparte dal passo chiesto e si rileggono categorie e
  // argomenti: la finestra può restare montata a lungo, la coda cambia.
  useEffect(() => {
    if (!aperta) return
    setPasso(iniziale.passo ?? 'scelta')
    setArgomento(iniziale.hotTopicId ?? null)
    setErrore(null)
    setErroreDati(null)
    void datiNuovoArticolo().then((esito) => {
      if (!esito.ok) return setErroreDati(esito.messaggio)
      setDati(esito.dati)
      setCategoria((c) => c || esito.dati.categorie[0]?.id || '')
      const primo = esito.dati.argomenti[0]
      if (!iniziale.hotTopicId && primo) setArgomento((a) => a ?? primo.id)
    })
  }, [aperta, iniziale])

  // L'argomento scelto porta con sé la categoria suggerita dalla rilevazione.
  useEffect(() => {
    const a = dati?.argomenti.find((x) => x.id === argomento)
    if (a?.categoriaId) setCategoria(a.categoriaId)
  }, [argomento, dati])

  useEffect(() => {
    if (!aperta) return
    const tasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && passo !== 'lavoro') onChiudi()
    }
    window.addEventListener('keydown', tasto)
    riquadro.current?.focus()
    return () => window.removeEventListener('keydown', tasto)
  }, [aperta, passo, onChiudi])

  // Le fasi avanzano mentre il modello scrive; l'ultima aspetta la risposta.
  useEffect(() => {
    if (passo !== 'lavoro' || fase >= FASI.length - 2) return
    const t = setTimeout(() => setFase((f) => f + 1), 4000)
    return () => clearTimeout(t)
  }, [passo, fase])

  if (!aperta) return null

  const aiAttiva = dati?.aiAttiva !== false

  async function scrivi(partenza: 'appunti' | 'hot_topic') {
    passoPrecedente.current = partenza === 'appunti' ? 'appunti' : 'argomento'
    setErrore(null)
    setFase(0)
    setPasso('lavoro')

    const esito = await scriviBozzaAi({
      partenza,
      testo: partenza === 'appunti' ? appunti : indicazioni,
      hotTopicId: partenza === 'hot_topic' ? (argomento ?? undefined) : undefined,
      categoriaId: categoria || null,
      lunghezza,
      taglio,
    })

    if (esito.ok) {
      setFase(FASI.length - 1)
      window.location.assign(esito.dati.urlModifica)
    } else {
      setErrore(esito.messaggio)
      setPasso(passoPrecedente.current)
    }
  }

  const opzioniComuni = (
    <>
      <div className="nuovo__griglia">
        <label className="nuovo__campo">
          <span className="nuovo__etichetta">Sezione</span>
          <select
            className="nuovo__select"
            value={categoria}
            onChange={(e) => setCategoria(e.currentTarget.value)}
          >
            {(dati?.categorie ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <div className="nuovo__campo">
          <span className="nuovo__etichetta">Lunghezza (parole)</span>
          <div className="nuovo__segmenti" role="group" aria-label="Lunghezza">
            {LUNGHEZZE.map((l) => (
              <button
                key={l.chiave}
                type="button"
                aria-pressed={lunghezza === l.chiave}
                onClick={() => setLunghezza(l.chiave)}
              >
                {l.etichetta}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="nuovo__campo">
        <span className="nuovo__etichetta">Taglio</span>
        <div className="nuovo__pastiglie">
          {TAGLI.map((t) => (
            <button
              key={t}
              type="button"
              className="nuovo__pastiglia"
              aria-pressed={taglio === t}
              onClick={() => setTaglio(taglio === t ? null : t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </>
  )

  const cosaSuccede = (materiale: string) => (
    <div className="nuovo__ruoli">
      <div className="nuovo__ruolo nuovo__ruolo--ai">
        <b>
          <Icona nome="ai" dimensione={13} tratto={2} />
          L’AI fa
        </b>
        Scrive titolo, sommario e corpo {materiale}. Elenca cosa manca o va verificato.
      </div>
      <div className="nuovo__ruolo nuovo__ruolo--tu">
        <b>
          <Icona nome="penna" dimensione={13} tratto={2} />
          Tu fai
        </b>
        Apri la bozza a tuo nome, verifichi, correggi e firmi. Niente viene pubblicato da solo.
      </div>
    </div>
  )

  let titolo = 'Da dove parti?'
  let corpo: ReactNode = null
  let piede: ReactNode = null

  if (passo === 'scelta') {
    corpo = (
      <>
        <a className="nuovo__opzione" href="/admin/collections/articles/create">
          <span className="nuovo__opzione-icona">
            <Icona nome="penna" />
          </span>
          <span className="nuovo__opzione-testi">
            <b>Foglio bianco</b>
            <span>
              Scrivi tu dall’inizio. L’assistente resta a disposizione nell’editor, solo quando
              lo chiami.
            </span>
          </span>
        </a>
        <button
          type="button"
          className="nuovo__opzione"
          disabled={!aiAttiva}
          onClick={() => setPasso('appunti')}
        >
          <span className="nuovo__opzione-icona nuovo__opzione-icona--ai">
            <Icona nome="ai" />
          </span>
          <span className="nuovo__opzione-testi">
            <b>
              Dai tuoi appunti <span className="segno-ai">AI</span>
            </b>
            <span>
              Scrivi fatto, contesto e fonti in poche righe. L’AI prepara una prima bozza e ti
              dice cosa verificare.
            </span>
          </span>
        </button>
        <button
          type="button"
          className="nuovo__opzione"
          disabled={!aiAttiva}
          onClick={() => setPasso('argomento')}
        >
          <span className="nuovo__opzione-icona nuovo__opzione-icona--ai">
            <Icona nome="fiamma" />
          </span>
          <span className="nuovo__opzione-testi">
            <b>
              Da un hot topic <span className="segno-ai">AI</span>
            </b>
            <span>
              Parti da un argomento che le tue fonti stanno coprendo. La bozza usa solo gli
              articoli raccolti.
            </span>
          </span>
        </button>
        {!aiAttiva && (
          <p className="nuovo__avviso">
            L’assistente non è attivo: {dati?.motivoAiSpenta ?? 'controlla le impostazioni AI.'}
          </p>
        )}
        {erroreDati && <p className="nuovo__avviso">{erroreDati}</p>}
      </>
    )
  } else if (passo === 'appunti') {
    titolo = 'Cosa deve raccontare il pezzo?'
    const abbastanza = appunti.trim().length >= 20
    corpo = (
      <>
        <label className="nuovo__campo">
          <span className="nuovo__etichetta">I tuoi appunti</span>
          <textarea
            className="nuovo__testo"
            value={appunti}
            onChange={(e) => setAppunti(e.currentTarget.value)}
            placeholder="Il fatto, chi è coinvolto, quando e dove. Le fonti che hai (agenzie, comunicati, link). L’angolo da privilegiare."
          />
          <span className="nuovo__aiuto">
            Più fatti e fonti metti qui, meno resta da verificare. Quello che non scrivi, l’AI
            non lo inventa: lo segnala.
          </span>
        </label>
        {opzioniComuni}
        {cosaSuccede('dai tuoi appunti')}
      </>
    )
    piede = (
      <>
        <button type="button" className="nuovo__pulsante" onClick={() => setPasso('scelta')}>
          <Icona nome="indietro" dimensione={16} />
          Indietro
        </button>
        <button
          type="button"
          className="nuovo__pulsante nuovo__pulsante--ai"
          disabled={!abbastanza}
          title={abbastanza ? undefined : 'Scrivi almeno un paio di righe'}
          onClick={() => void scrivi('appunti')}
        >
          <Icona nome="ai" dimensione={16} />
          Scrivi la bozza
        </button>
      </>
    )
  } else if (passo === 'argomento') {
    titolo = 'Scegli l’argomento'
    const argomenti = dati?.argomenti ?? []
    corpo = (
      <>
        {dati && argomenti.length === 0 ? (
          <p className="nuovo__avviso">
            Non ci sono hot topic nuovi in questo momento. La rilevazione gira da sola sulle fonti
            RSS: torna più tardi o parti dai tuoi appunti.
          </p>
        ) : (
          <div className="nuovo__argomenti" role="radiogroup" aria-label="Argomento">
            {argomenti.map((a) => (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={argomento === a.id}
                className="nuovo__argomento"
                onClick={() => setArgomento(a.id)}
              >
                <span className="nuovo__radio" aria-hidden="true" />
                <span>
                  <b>{a.titolo}</b>
                  <span>
                    {a.fonti} {a.fonti === 1 ? 'articolo' : 'articoli'}
                    {a.testate.length ? ` · ${a.testate.slice(0, 3).join(', ')}` : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
        <label className="nuovo__campo">
          <span className="nuovo__etichetta">Indicazioni (facoltative)</span>
          <textarea
            className="nuovo__testo nuovo__testo--breve"
            value={indicazioni}
            onChange={(e) => setIndicazioni(e.currentTarget.value)}
            placeholder="Es. concentrati sull’impatto per le famiglie; cita il ministero se c’è una nota."
          />
        </label>
        {opzioniComuni}
        {cosaSuccede('dagli articoli raccolti sull’argomento')}
      </>
    )
    piede = (
      <>
        <button type="button" className="nuovo__pulsante" onClick={() => setPasso('scelta')}>
          <Icona nome="indietro" dimensione={16} />
          Indietro
        </button>
        <button
          type="button"
          className="nuovo__pulsante nuovo__pulsante--ai"
          disabled={!argomento}
          onClick={() => void scrivi('hot_topic')}
        >
          <Icona nome="ai" dimensione={16} />
          Scrivi la bozza
        </button>
      </>
    )
  } else {
    titolo = 'Sto preparando la bozza'
    corpo = (
      <>
        <ol className="nuovo__fasi">
          {FASI.map((f, i) => (
            <li
              key={f.testo}
              className={i < fase ? 'fatta' : i === fase ? 'in-corso' : undefined}
              aria-current={i === fase ? 'step' : undefined}
            >
              <span className="nuovo__fase-segno" aria-hidden="true">
                {i < fase ? <Icona nome="spunta" dimensione={12} tratto={3} /> : null}
              </span>
              {f.testo}
              <span className="nuovo__fase-chi">{f.chi}</span>
            </li>
          ))}
        </ol>
        <p className="nuovo__aiuto">
          Di solito ci vogliono venti, trenta secondi. Non chiudere questa finestra.
        </p>
      </>
    )
  }

  return createPortal(
    <>
      <div className="nuovo__velo" onClick={passo === 'lavoro' ? undefined : onChiudi} />
      <div
        className="nuovo"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nuovo-titolo"
        ref={riquadro}
        tabIndex={-1}
      >
        <header className="nuovo__testa">
          <div>
            <p className="nuovo__etichetta">
              Nuovo articolo
              {passo === 'appunti' ? ' · dai tuoi appunti' : passo === 'argomento' ? ' · da un hot topic' : ''}
            </p>
            <h2 id="nuovo-titolo">{titolo}</h2>
          </div>
          {passo !== 'lavoro' && (
            <button type="button" className="nuovo__chiudi" aria-label="Chiudi" onClick={onChiudi}>
              <Icona nome="chiudi" />
            </button>
          )}
        </header>
        {errore && (
          <p className="nuovo__errore" role="alert">
            {errore}
          </p>
        )}
        <div className="nuovo__corpo">{corpo}</div>
        {piede && <footer className="nuovo__piede">{piede}</footer>}
      </div>
    </>,
    document.body,
  )
}

export default NuovoArticolo
