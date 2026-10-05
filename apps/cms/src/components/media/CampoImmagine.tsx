'use client'

import { useCallback, useEffect, useState, type DragEvent } from 'react'
import type { UploadFieldClientComponent } from 'payload'
import { FieldError, FieldLabel, useField } from '@payloadcms/ui'

import { Icona } from '@/components/Icona'
import { SceltaImmagine, type Scheda } from './SceltaImmagine'
import { leggiImmagine, miniatura, type ImmagineMedia } from './tipi'

import './media.scss'

/**
 * Campo immagine (copertina, immagine social, logo, foto) — al posto del
 * campo upload di Payload, che apre un pannello laterale con la tabella dei
 * file. Qui l'immagine si vede grande, e «Carica» / «Scegli dall'archivio»
 * aprono la stessa finestra di «Nuovo articolo» (vedi SceltaImmagine).
 *
 * Nel form il valore resta quello di Payload: l'id del documento media.
 */
export const CampoImmagine: UploadFieldClientComponent = ({ field, path, readOnly }) => {
  const { value, setValue, showError, errorMessage } = useField<string | { id: string } | null>({
    path,
  })
  const id = value && typeof value === 'object' ? value.id : (value ?? null)

  const [immagine, setImmagine] = useState<ImmagineMedia | null>(null)
  const [finestra, setFinestra] = useState<{ scheda: Scheda; file: File | null } | null>(null)
  const [trascina, setTrascina] = useState(false)

  // L'anteprima si rilegge quando il valore cambia da fuori (per esempio la
  // copertina proposta dall'assistente AI).
  useEffect(() => {
    if (!id) return setImmagine(null)
    if (immagine?.id === id) return
    let attuale = true
    void leggiImmagine(id).then((m) => attuale && setImmagine(m))
    return () => {
      attuale = false
    }
  }, [id, immagine?.id])

  const chiudi = useCallback(() => setFinestra(null), [])

  function scegli(m: ImmagineMedia) {
    setImmagine(m)
    setValue(m.id)
    setFinestra(null)
  }

  function lasciaFile(e: DragEvent) {
    e.preventDefault()
    setTrascina(false)
    const f = e.dataTransfer.files?.[0]
    if (f && !readOnly) setFinestra({ scheda: 'carica', file: f })
  }

  const etichetta = typeof field.label === 'string' ? field.label : 'Immagine'
  const descrizione = typeof field.admin?.description === 'string' ? field.admin.description : null

  return (
    <div className={`field-type campo-immagine${showError ? ' error' : ''}`}>
      <FieldLabel label={field.label} path={path} required={field.required} />
      <FieldError path={path} message={errorMessage} showError={showError} />

      {id ? (
        <div className="campo-immagine__scelta">
          <span className="campo-immagine__anteprima">
            {immagine && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={miniatura(immagine)} alt="" />
            )}
          </span>
          <div className="campo-immagine__dati">
            <b>{immagine ? immagine.alt || immagine.filename : 'Caricamento…'}</b>
            {immagine && (
              <span>
                {immagine.filename}
                {immagine.width && immagine.height ? ` · ${immagine.width}×${immagine.height}` : ''}
              </span>
            )}
            {!readOnly && (
              <div className="campo-immagine__azioni">
                <button
                  type="button"
                  className="campo-immagine__pulsante"
                  onClick={() => setFinestra({ scheda: 'archivio', file: null })}
                >
                  Cambia
                </button>
                <a
                  className="campo-immagine__pulsante"
                  href={`/admin/collections/media/${id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Modifica dettagli ↗
                </a>
                <button
                  type="button"
                  className="campo-immagine__pulsante campo-immagine__pulsante--tenue"
                  aria-label={`Togli ${etichetta.toLowerCase()}`}
                  onClick={() => setValue(null)}
                >
                  <Icona nome="cestino" dimensione={14} />
                  Togli
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div
          className={`campo-immagine__vuoto${trascina ? ' campo-immagine__vuoto--sopra' : ''}`}
          onDragOver={(e) => {
            if (readOnly) return
            e.preventDefault()
            setTrascina(true)
          }}
          onDragLeave={() => setTrascina(false)}
          onDrop={lasciaFile}
        >
          <span className="campo-immagine__icona" aria-hidden="true">
            <Icona nome="immagine" />
          </span>
          <span className="campo-immagine__invito">
            <b>Nessuna immagine</b>
            <span>
              Trascinala qui, caricala dal computer o sceglila fra quelle già in archivio.
            </span>
          </span>
          {!readOnly && (
            <span className="campo-immagine__azioni">
              <button
                type="button"
                className="campo-immagine__pulsante"
                onClick={() => setFinestra({ scheda: 'carica', file: null })}
              >
                Carica
              </button>
              <button
                type="button"
                className="campo-immagine__pulsante campo-immagine__pulsante--pieno"
                onClick={() => setFinestra({ scheda: 'archivio', file: null })}
              >
                Scegli dall’archivio
              </button>
            </span>
          )}
        </div>
      )}

      {descrizione && <p className="field-description campo-immagine__nota">{descrizione}</p>}

      <SceltaImmagine
        aperta={finestra !== null}
        etichetta={etichetta}
        scheda={finestra?.scheda ?? 'archivio'}
        fileIniziale={finestra?.file ?? null}
        selezionata={id}
        onScegli={scegli}
        onChiudi={chiudi}
      />
    </div>
  )
}

export default CampoImmagine
