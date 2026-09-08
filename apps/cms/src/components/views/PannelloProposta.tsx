'use client'

import { useState, useTransition } from 'react'

import { portaInBozza, type Proposta } from './azioniAi'

/**
 * Proposta dell'assistente, elemento per elemento — dai design
 * (Generazione da Brief v1, blocco "proposta").
 *
 * Il punto di questo pannello è che NON esiste un pulsante "accetta tutto e
 * pubblica". Ogni elemento — titolo, occhiello, corpo, tag — si accetta o si
 * scarta separatamente, e tutti sono modificabili prima di essere accettati.
 * Ciò che finisce in bozza è quindi il testo che una persona ha approvato,
 * non quello che il modello ha prodotto: è RF-AI-08 reso operativo invece che
 * dichiarato.
 */

interface Props {
  proposta: Proposta
  categorie: Array<{ id: string; nome: string }>
  categoriaIniziale?: string | null
  hotTopicId?: string | null
  brief?: string | null
  /** Da dove nasce la proposta, mostrato in testa. */
  origine?: string
  onChiudi: () => void
}

export function PannelloProposta({
  proposta,
  categorie,
  categoriaIniziale,
  hotTopicId,
  brief,
  origine,
  onChiudi,
}: Props) {
  const [titolo, setTitolo] = useState(proposta.titolo)
  const [occhiello, setOcchiello] = useState(proposta.occhiello)
  const [sommario, setSommario] = useState(proposta.sommario)
  const [corpo, setCorpo] = useState(proposta.paragrafi.join('\n\n'))
  const [tag, setTag] = useState<string[]>(proposta.tagSuggeriti)
  const [categoria, setCategoria] = useState(categoriaIniziale ?? categorie[0]?.id ?? '')

  const [accettati, setAccettati] = useState<Set<string>>(new Set())
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()

  const elementi = ['titolo', 'occhiello', 'corpo', 'tag'] as const
  const tuttiAccettati = elementi.every((e) => accettati.has(e))

  function commuta(chiave: string) {
    setAccettati((p) => {
      const n = new Set(p)
      if (n.has(chiave)) n.delete(chiave)
      else n.add(chiave)
      return n
    })
  }

  const parole = corpo.split(/\s+/).filter(Boolean).length

  function apriInEditor() {
    setErrore(null)
    avvia(async () => {
      const esito = await portaInBozza({
        proposta: {
          ...proposta,
          titolo,
          occhiello,
          sommario,
          paragrafi: corpo
            .split(/\n{2,}/)
            .map((p) => p.trim())
            .filter(Boolean),
          tagSuggeriti: tag,
        },
        categoriaId: categoria || null,
        hotTopicId: hotTopicId ?? null,
        brief: brief ?? null,
      })

      if (esito.ok) window.location.assign(esito.dati.urlModifica)
      else setErrore(esito.messaggio)
    })
  }

  function Etichetta({ chiave, testo }: { chiave: string; testo: string }) {
    const on = accettati.has(chiave)
    return (
      <div className="proposta__riga-etichetta">
        <span className="proposta__etichetta">{testo}</span>
        <button
          type="button"
          className={`accetta${on ? ' accetta--on' : ''}`}
          aria-pressed={on}
          onClick={() => commuta(chiave)}
        >
          {on ? '✓ Accettato' : 'Accetta'}
        </button>
      </div>
    )
  }

  return (
    <div className="proposta">
      <header className="proposta__testata">
        <span className="proposta__marchio">Proposta</span>
        <span className="proposta__origine">
          {origine ? `${origine} · ` : ''}da revisionare, nulla è ancora salvato
        </span>
        <span className="proposta__conteggio">
          {accettati.size}/{elementi.length} elementi accettati
        </span>
      </header>

      {errore && (
        <p className="ai-messaggio ai-messaggio--errore" role="alert">
          {errore}
        </p>
      )}

      {/* ---------- Punti da verificare: prima di tutto il resto ---------- */}
      {proposta.puntiDaVerificare.length > 0 && (
        <div className="verifiche">
          <h3>Da verificare prima di usare questo testo</h3>
          <ul>
            {proposta.puntiDaVerificare.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ---------- Titolo ---------- */}
      <section className="proposta__blocco">
        <Etichetta chiave="titolo" testo="Titolo proposto" />
        <textarea
          className="campo campo--titolo"
          rows={2}
          value={titolo}
          onChange={(e) => setTitolo(e.currentTarget.value)}
        />
        {proposta.titoliAlternativi.length > 0 && (
          <div className="alternativi">
            <span className="alternativi__etichetta">Alternative</span>
            {proposta.titoliAlternativi.map((t, i) => (
              <button key={i} type="button" className="alternativi__voce" onClick={() => setTitolo(t)}>
                {t}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ---------- Occhiello ---------- */}
      <section className="proposta__blocco">
        <Etichetta chiave="occhiello" testo="Occhiello proposto" />
        <input
          className="campo campo--occhiello"
          value={occhiello}
          onChange={(e) => setOcchiello(e.currentTarget.value)}
        />
      </section>

      {/* ---------- Sommario ---------- */}
      <section className="proposta__blocco">
        <span className="proposta__etichetta">Sommario proposto</span>
        <textarea
          className="campo"
          rows={3}
          value={sommario}
          onChange={(e) => setSommario(e.currentTarget.value)}
        />
      </section>

      {/* ---------- Corpo ---------- */}
      <section className="proposta__blocco">
        <Etichetta chiave="corpo" testo={`Corpo proposto · ${parole} parole`} />
        <textarea
          className="campo campo--corpo"
          value={corpo}
          onChange={(e) => setCorpo(e.currentTarget.value)}
        />
        <p className="proposta__monito">
          Fatti, cifre e citazioni vanno verificati sulle fonti prima di qualsiasi utilizzo.
        </p>
      </section>

      {/* ---------- Tag ---------- */}
      <section className="proposta__blocco">
        <Etichetta chiave="tag" testo="Tag suggeriti" />
        <div className="tag-proposti">
          {proposta.tagSuggeriti.map((t) => {
            const on = tag.includes(t)
            return (
              <button
                key={t}
                type="button"
                className={`tag-proposto${on ? ' tag-proposto--on' : ''}`}
                aria-pressed={on}
                onClick={() => setTag((p) => (on ? p.filter((x) => x !== t) : [...p, t]))}
              >
                {t} <span aria-hidden="true">{on ? '✓' : '+'}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ---------- Destinazione ---------- */}
      <section className="proposta__blocco">
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
      </section>

      <footer className="proposta__azioni">
        <button
          type="button"
          className="azione azione--primaria"
          disabled={inCorso}
          onClick={apriInEditor}
        >
          {inCorso ? 'Creo la bozza…' : 'Apri in editor come bozza'}
        </button>
        <button type="button" className="azione" disabled={inCorso} onClick={onChiudi}>
          Scarta la proposta
        </button>
        <span className="proposta__nota">
          {tuttiAccettati
            ? 'Hai esaminato tutti gli elementi.'
            : 'Puoi portarla in bozza anche senza accettare tutto: gli spunti restano modificabili nell’editor.'}
        </span>
      </footer>
    </div>
  )
}

export default PannelloProposta
