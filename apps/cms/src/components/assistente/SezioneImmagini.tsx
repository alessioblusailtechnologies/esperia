'use client'

import { useState } from 'react'
import { useForm } from '@payloadcms/ui'

import { proponiImmagini, salvaCopertina } from './azioni'
import type { ImmagineProposta } from '@/lib/ai/immagini'

/**
 * "Immagini per l'articolo" nel pannello dell'assistente — RF-AI-07.
 * Impaginazione e testi dai design (Editor v1).
 *
 * Le proposte restano nel browser finche' il redattore non ne sceglie una:
 * solo quella entra nella media library, marcata come generata e con la
 * dicitura nei crediti, e diventa la copertina dell'articolo aperto.
 */

interface Props {
  stato: { attivo: boolean; messaggio: string; quante: number; formato: string } | null
}

export function SezioneImmagini({ stato }: Props) {
  const [descrizione, setDescrizione] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const [proposte, setProposte] = useState<ImmagineProposta[]>([])
  const [scelta, setScelta] = useState<number | null>(null)
  const [salvataggio, setSalvataggio] = useState(false)
  const [impostata, setImpostata] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [avviso, setAvviso] = useState<string | null>(null)

  const { dispatchFields, setModified } = useForm()
  const attivo = stato?.attivo === true

  async function genera() {
    if (!attivo || inCorso) return
    setInCorso(true)
    setErrore(null)
    setAvviso(null)
    setProposte([])
    setScelta(null)
    setImpostata(false)

    const esito = await proponiImmagini(descrizione)
    setInCorso(false)

    if (!esito.ok) {
      setErrore(esito.messaggio)
      return
    }
    setProposte(esito.dati.immagini)
    if (esito.dati.scartate > 0) {
      setAvviso(
        `${esito.dati.scartate} ${esito.dati.scartate === 1 ? 'proposta non è stata generata' : 'proposte non sono state generate'}.`,
      )
    }
  }

  async function usaComeCopertina() {
    if (scelta === null || salvataggio) return
    const immagine = proposte[scelta]
    if (!immagine) return
    setSalvataggio(true)
    setErrore(null)

    const esito = await salvaCopertina({ ...immagine, descrizione })
    setSalvataggio(false)

    if (!esito.ok) {
      setErrore(esito.messaggio)
      return
    }
    dispatchFields({ type: 'UPDATE', path: 'heroImage', value: esito.dati.id })
    setModified(true)
    setImpostata(true)
  }

  const etichettaGenera = !attivo
    ? 'Generazione non disponibile'
    : inCorso
      ? 'Generazione in corso…'
      : proposte.length > 0
        ? 'Genera altre proposte'
        : 'Genera proposte'

  const etichettaCopertina = impostata
    ? '✓ impostata come copertina (bozza)'
    : salvataggio
      ? 'Salvataggio…'
      : scelta !== null
        ? `Usa la proposta ${scelta + 1} come copertina`
        : 'Seleziona una proposta'

  return (
    <div className="assistente__immagini">
      <label className="assistente__etichetta" htmlFor="assistente-immagine">
        Immagini per l’articolo
      </label>

      {stato && !attivo && <p className="assistente__ambito">{stato.messaggio}</p>}

      <textarea
        id="assistente-immagine"
        className="assistente__descrizione"
        rows={3}
        value={descrizione}
        disabled={!attivo}
        placeholder="Descrivi l’immagine: soggetto, ambiente, taglio fotografico…"
        onChange={(e) => setDescrizione(e.target.value)}
      />

      <button
        type="button"
        className="assistente__strumento"
        disabled={!attivo || inCorso || descrizione.trim().length < 15}
        onClick={() => void genera()}
      >
        {etichettaGenera}
      </button>

      {attivo && stato && proposte.length === 0 && !inCorso && (
        <p className="assistente__ambito">
          {stato.quante} {stato.quante === 1 ? 'proposta' : 'proposte'} in formato {stato.formato},
          ognuna fatturata come un’immagine.
        </p>
      )}

      {errore && (
        <p className="assistente__errore" role="alert">
          {errore}
        </p>
      )}
      {avviso && <p className="assistente__ambito">{avviso}</p>}

      {inCorso && (
        <div className="assistente__griglia" aria-live="polite">
          {Array.from({ length: stato?.quante ?? 4 }, (_, i) => (
            <span key={i} className="assistente__segnaposto" />
          ))}
        </div>
      )}

      {proposte.length > 0 && (
        <>
          <div className="assistente__griglia" role="radiogroup" aria-label="Proposte di immagine">
            {proposte.map((p, i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={scelta === i}
                className={`assistente__miniatura${scelta === i ? ' assistente__miniatura--scelta' : ''}`}
                onClick={() => {
                  setScelta(i)
                  setImpostata(false)
                }}
              >
                <img src={`data:${p.mimeType};base64,${p.base64}`} alt={`Proposta ${i + 1}`} />
                <span className="assistente__miniatura-etichetta">proposta {i + 1}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`assistente__copertina${impostata ? ' assistente__copertina--fatto' : ''}`}
            disabled={scelta === null || salvataggio || impostata}
            onClick={() => void usaComeCopertina()}
          >
            {etichettaCopertina}
          </button>

          <p className="assistente__piede">
            Immagini generate: vanno etichettate come tali in didascalia e approvate dal
            caposervizio prima della pubblicazione. La dicitura viene aggiunta ai crediti in
            automatico.
          </p>
        </>
      )}
    </div>
  )
}
