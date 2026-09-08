'use client'

import { useState, useTransition } from 'react'

import { PannelloProposta } from '../PannelloProposta'
import { proponiDaBrief, type Proposta } from '../azioniAi'

/**
 * Modulo del brief — dai design (Generazione da Brief v1).
 *
 * Due colonne: a sinistra ciò che la redazione chiede, a destra ciò che
 * l'assistente propone. Finché non si preme «Apri in editor» non viene
 * scritto nulla nel database.
 */

const LUNGHEZZE = [
  { valore: 'breve', etichetta: 'Breve · 300–400 parole' },
  { valore: 'media', etichetta: 'Media · 600–800 parole' },
  { valore: 'lunga', etichetta: 'Lunga · 1200–1500 parole' },
]

const TAGLI = [
  'Cronaca dei fatti',
  'Analisi e contesto',
  'Che cosa cambia',
  'Le reazioni',
]

export function ModuloBrief({ categorie }: { categorie: Array<{ id: string; nome: string }> }) {
  const [brief, setBrief] = useState('')
  const [categoria, setCategoria] = useState(categorie[0]?.id ?? '')
  const [lunghezza, setLunghezza] = useState('media')
  const [taglio, setTaglio] = useState<string | null>(null)

  const [proposta, setProposta] = useState<Proposta | null>(null)
  const [briefUsato, setBriefUsato] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()

  const abbastanza = brief.trim().length >= 20

  function genera() {
    setErrore(null)
    setProposta(null)
    const testo = brief.trim()

    avvia(async () => {
      const esito = await proponiDaBrief({
        brief: testo,
        lunghezza,
        taglio: taglio ?? undefined,
      })

      if (esito.ok) {
        setProposta(esito.dati)
        setBriefUsato(testo)
      } else {
        setErrore(esito.messaggio)
      }
    })
  }

  return (
    <div className="ai-vista__corpo brief">
      {/* ---------- Colonna del brief ---------- */}
      <div className="brief__modulo">
        <span className="proposta__etichetta">Brief della redazione</span>
        <textarea
          className="campo campo--brief"
          value={brief}
          onChange={(e) => setBrief(e.currentTarget.value)}
          placeholder="Racconta cosa serve: fatto, contesto, fonti da tenere presenti, angolo da privilegiare…"
        />

        <div className="brief__opzioni">
          <label className="brief__campo">
            <span className="proposta__etichetta">Categoria di destinazione</span>
            <select
              className="campo campo--select"
              value={categoria}
              onChange={(e) => setCategoria(e.currentTarget.value)}
            >
              {categorie.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>

          <label className="brief__campo">
            <span className="proposta__etichetta">Lunghezza indicativa</span>
            <select
              className="campo campo--select"
              value={lunghezza}
              onChange={(e) => setLunghezza(e.currentTarget.value)}
            >
              {LUNGHEZZE.map((l) => (
                <option key={l.valore} value={l.valore}>
                  {l.etichetta}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="brief__taglio">
          <span className="proposta__etichetta">Taglio</span>
          <div className="ai-filtri__gruppo">
            {TAGLI.map((t) => (
              <button
                key={t}
                type="button"
                className={`pastiglia-filtro${taglio === t ? ' pastiglia-filtro--attiva' : ''}`}
                onClick={() => setTaglio(taglio === t ? null : t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="brief__azioni">
          <button
            type="button"
            className="azione azione--primaria"
            disabled={!abbastanza || inCorso}
            onClick={genera}
          >
            {inCorso ? 'Sto scrivendo…' : 'Genera proposta'}
          </button>
          <span className="brief__nota">
            {abbastanza
              ? 'La proposta compare a destra: nulla viene salvato finché non decidi tu.'
              : 'Scrivi almeno un paio di righe: più contesto dai, meno c’è da correggere.'}
          </span>
        </div>
      </div>

      {/* ---------- Colonna della proposta ---------- */}
      <div className="brief__esito">
        {errore && (
          <p className="ai-messaggio ai-messaggio--errore" role="alert">
            {errore}
          </p>
        )}

        {inCorso && !proposta && (
          <div className="ai-attesa">
            <span className="ai-attesa__punto" aria-hidden="true" />
            <div>
              <h2>Sto scrivendo la proposta</h2>
              <p>
                Ci vogliono in genere una ventina di secondi. Puoi lasciare la pagina aperta e
                tornare fra poco.
              </p>
            </div>
          </div>
        )}

        {!inCorso && !proposta && !errore && (
          <div className="ai-vuoto">
            <h2>Nessuna proposta ancora</h2>
            <p>
              Scrivi il brief e premi «Genera proposta». Il risultato apparirà qui come
              materiale di lavoro: potrai correggerlo e poi portarlo nell’editor come bozza.
            </p>
          </div>
        )}

        {proposta && (
          <PannelloProposta
            proposta={proposta}
            categorie={categorie}
            categoriaIniziale={categoria}
            brief={briefUsato}
            origine="Da brief"
            onChiudi={() => setProposta(null)}
          />
        )}
      </div>
    </div>
  )
}

export default ModuloBrief
