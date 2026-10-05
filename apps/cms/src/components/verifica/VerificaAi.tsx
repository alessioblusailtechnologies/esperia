'use client'

import { useState } from 'react'
import { useField, useFormFields } from '@payloadcms/ui'

import { Icona } from '@/components/Icona'

import './VerificaAi.scss'

/**
 * Riquadro «Prima di inviare» in cima alla colonna dell'editor — RF-AI-08.
 *
 * Compare solo sugli articoli nati da una bozza AI. Dice da dove viene il
 * testo e mostra i punti che il modello ha segnalato scrivendolo: cifre da
 * confermare, fonti mancanti, dichiarazioni da cercare. Chi firma li spunta
 * man mano che li verifica.
 *
 * È un aiuto, non un vincolo: «Invia in revisione» funziona sempre. Se restano
 * punti aperti chiede una conferma, e l'Editor li ritrova qui quando apre il
 * pezzo per approvarlo. Il controllo umano richiesto (HITL) è quella
 * approvazione, già imposta dal workflow (RF-B-05).
 */

interface Punto {
  testo: string
  fatto: boolean
}

const ORIGINI: Record<string, string> = {
  brief: 'dai tuoi appunti',
  hot_topic: 'da un hot topic',
}

const formatoData = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

export function VerificaAi() {
  const origine = useFormFields(([campi]) => campi['ai.origin']?.value as string | undefined)
  const modello = useFormFields(([campi]) => campi['ai.model']?.value as string | undefined)
  const generatoIl = useFormFields(([campi]) => campi['ai.generatedAt']?.value as string | undefined)
  const appunti = useFormFields(([campi]) => campi['ai.brief']?.value as string | undefined)

  const punti = useField<Punto[] | null>({ path: 'ai.checks' })
  const riletto = useField<boolean>({ path: 'ai.humanReviewed' })
  const stato = useField<string>({ path: 'editorialStatus' })

  const [mostraAppunti, setMostraAppunti] = useState(false)
  const [conferma, setConferma] = useState(false)

  if (!origine || !ORIGINI[origine]) return null

  const lista = Array.isArray(punti.value) ? punti.value : []
  const chiusi = lista.filter((p) => p.fatto).length
  const firmato = riletto.value === true
  const pronto = chiusi === lista.length && firmato
  const inBozza = (stato.value ?? 'bozza') === 'bozza'
  const aperti = lista.length - chiusi

  function invia() {
    if (!pronto && !conferma) {
      setConferma(true)
      return
    }
    setConferma(false)
    stato.setValue('in_revisione')
  }

  function commuta(i: number) {
    punti.setValue(lista.map((p, j) => (j === i ? { ...p, fatto: !p.fatto } : p)))
  }

  return (
    <section className="verifica-ai" aria-label="Verifica della bozza AI">
      <header className="verifica-ai__origine">
        <Icona nome="ai" dimensione={14} tratto={2} />
        <span>
          <b>Bozza scritta dall’AI</b> {ORIGINI[origine]}
          {modello ? ` · ${modello}` : ''}
          {generatoIl ? ` · ${formatoData.format(new Date(generatoIl))}` : ''}
        </span>
      </header>

      {appunti && (
        <div className="verifica-ai__appunti">
          <button type="button" onClick={() => setMostraAppunti((v) => !v)}>
            {mostraAppunti ? 'Nascondi le indicazioni date' : 'Vedi le indicazioni date'}
          </button>
          {mostraAppunti && <p>{appunti}</p>}
        </div>
      )}

      <div className="verifica-ai__testa">
        <h3>Prima di inviare</h3>
        <span className="verifica-ai__progresso">
          {chiusi + (firmato ? 1 : 0)}/{lista.length + 1}
        </span>
      </div>

      <ul className="verifica-ai__lista">
        {lista.map((p, i) => (
          <li key={i}>
            <label className="verifica-ai__voce">
              <input
                type="checkbox"
                checked={p.fatto}
                disabled={!inBozza}
                onChange={() => commuta(i)}
              />
              <span>{p.testo}</span>
            </label>
          </li>
        ))}
        <li>
          <label className="verifica-ai__voce verifica-ai__voce--firma">
            <input
              type="checkbox"
              checked={firmato}
              disabled={!inBozza}
              onChange={() => riletto.setValue(!firmato)}
            />
            <span>Ho riletto tutto il testo e lo firmo</span>
          </label>
        </li>
      </ul>

      {inBozza ? (
        <>
          {conferma ? (
            <div className="verifica-ai__conferma" role="alertdialog" aria-label="Conferma invio">
              <p>
                {aperti > 0
                  ? `Restano ${aperti} ${aperti === 1 ? 'punto da verificare' : 'punti da verificare'}`
                  : 'Non hai ancora confermato di aver riletto il testo'}
                . L’Editor li vedrà in questo riquadro quando apre il pezzo.
              </p>
              <div className="verifica-ai__conferma-azioni">
                <button type="button" className="verifica-ai__invia" onClick={invia}>
                  Invia comunque
                </button>
                <button
                  type="button"
                  className="verifica-ai__annulla"
                  onClick={() => setConferma(false)}
                >
                  Annulla
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="verifica-ai__invia" onClick={invia}>
              <Icona nome="invia" dimensione={15} />
              Invia in revisione
            </button>
          )}
          <p className="verifica-ai__nota">
            {pronto
              ? 'Tutto verificato. Lo stato passa a «In revisione» e si salva da solo in pochi secondi.'
              : 'La lista l’ha preparata l’AI mentre scriveva: segnala cosa non ha trovato nelle fonti. È un promemoria, l’approvazione spetta all’Editor.'}
          </p>
        </>
      ) : pronto ? (
        <p className="verifica-ai__nota verifica-ai__nota--ok">
          <Icona nome="spunta" dimensione={14} tratto={2.4} />
          Verificata e firmata da chi l’ha scritta.
        </p>
      ) : (
        <p className="verifica-ai__nota verifica-ai__nota--aperta">
          Inviata in revisione con{' '}
          {aperti > 0
            ? `${aperti} ${aperti === 1 ? 'punto aperto' : 'punti aperti'}`
            : 'la rilettura non confermata'}
          : controllali prima di approvare.
        </p>
      )}
    </section>
  )
}

export default VerificaAi
