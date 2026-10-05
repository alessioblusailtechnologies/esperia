'use client'

import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { Icona } from '@/components/Icona'
import { miniatura, type ImmagineMedia } from './tipi'

import '@/components/nav/NuovoArticolo.scss'
import './media.scss'

/**
 * Finestra per scegliere o caricare un'immagine — stessa impaginazione di
 * «Nuovo articolo» (velo, riquadro centrale, schede a pastiglia), al posto
 * del pannello laterale di Payload con la tabella dei file.
 *
 * Due schede: l'archivio, a griglia di miniature con ricerca, e il
 * caricamento di un file nuovo con testo alternativo (obbligatorio, come
 * nella media library), didascalia e crediti. In entrambi i casi la finestra
 * restituisce l'immagine scelta: è il campo a metterla nel documento.
 */

export type Scheda = 'archivio' | 'carica'

const PER_PAGINA = 24
const FORMATI = 'image/jpeg,image/png,image/webp,image/gif,image/avif,image/svg+xml'

const data = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Europe/Rome',
})

export function SceltaImmagine({
  aperta,
  etichetta,
  scheda: schedaIniziale,
  fileIniziale,
  selezionata,
  onScegli,
  onChiudi,
}: {
  aperta: boolean
  etichetta: string
  scheda: Scheda
  fileIniziale?: File | null
  selezionata: string | null
  onScegli: (immagine: ImmagineMedia) => void
  onChiudi: () => void
}) {
  const [scheda, setScheda] = useState<Scheda>(schedaIniziale)
  const riquadro = useRef<HTMLDivElement>(null)

  // Archivio
  const [cerca, setCerca] = useState('')
  const [elenco, setElenco] = useState<ImmagineMedia[]>([])
  const [pagina, setPagina] = useState(1)
  const [altre, setAltre] = useState(false)
  const [caricamento, setCaricamento] = useState(false)
  const [scelta, setScelta] = useState<ImmagineMedia | null>(null)

  // Caricamento
  const [file, setFile] = useState<File | null>(null)
  const [anteprima, setAnteprima] = useState<string | null>(null)
  const [alt, setAlt] = useState('')
  const [didascalia, setDidascalia] = useState('')
  const [crediti, setCrediti] = useState('')
  const [trascina, setTrascina] = useState(false)
  const [invio, setInvio] = useState(false)
  const scegliFile = useRef<HTMLInputElement>(null)

  const [errore, setErrore] = useState<string | null>(null)

  // A ogni apertura si riparte puliti, sulla scheda chiesta dal campo.
  useEffect(() => {
    if (!aperta) return
    setScheda(schedaIniziale)
    setCerca('')
    setScelta(null)
    setErrore(null)
    setAlt('')
    setDidascalia('')
    setCrediti('')
    impostaFile(fileIniziale ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aperta, schedaIniziale, fileIniziale])

  useEffect(() => {
    if (!aperta) return
    const tasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !invio) onChiudi()
    }
    window.addEventListener('keydown', tasto)
    riquadro.current?.focus()
    return () => window.removeEventListener('keydown', tasto)
  }, [aperta, invio, onChiudi])

  // L'archivio si rilegge mentre si scrive, con una pausa per non chiamare a ogni tasto.
  useEffect(() => {
    if (!aperta || scheda !== 'archivio') return
    const t = setTimeout(() => void leggi(1, cerca), cerca ? 250 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aperta, scheda, cerca])

  useEffect(
    () => () => {
      if (anteprima) URL.revokeObjectURL(anteprima)
    },
    [anteprima],
  )

  async function leggi(p: number, testo: string) {
    setCaricamento(true)
    setErrore(null)
    const qs = new URLSearchParams({
      limit: String(PER_PAGINA),
      page: String(p),
      sort: '-createdAt',
      depth: '0',
      'where[and][0][mimeType][like]': 'image/',
    })
    const q = testo.trim()
    if (q) {
      qs.set('where[and][1][or][0][alt][like]', q)
      qs.set('where[and][1][or][1][filename][like]', q)
    }
    try {
      const r = await fetch(`/api/media?${qs}`, { credentials: 'include' })
      if (!r.ok) throw new Error(String(r.status))
      const json = (await r.json()) as { docs: ImmagineMedia[]; hasNextPage: boolean }
      setElenco((prima) => (p === 1 ? json.docs : [...prima, ...json.docs]))
      setPagina(p)
      setAltre(json.hasNextPage)
    } catch {
      setErrore('Non è stato possibile leggere l’archivio. Riprova.')
    } finally {
      setCaricamento(false)
    }
  }

  function impostaFile(f: File | null) {
    setFile(f)
    setAnteprima(f ? URL.createObjectURL(f) : null)
    if (f) {
      setErrore(null)
      // Un punto di partenza per il testo alternativo: il nome del file, leggibile.
      setAlt(
        (a) =>
          a ||
          f.name
            .replace(/\.[^.]+$/, '')
            .replace(/[-_]+/g, ' ')
            .trim(),
      )
    }
  }

  function lasciaFile(e: DragEvent) {
    e.preventDefault()
    setTrascina(false)
    const f = e.dataTransfer.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) {
      setErrore('Qui si caricano solo immagini (JPG, PNG, WebP…).')
      return
    }
    impostaFile(f)
  }

  async function carica() {
    if (!file || !alt.trim() || invio) return
    setInvio(true)
    setErrore(null)
    const corpo = new FormData()
    corpo.append('file', file)
    corpo.append(
      '_payload',
      JSON.stringify({
        alt: alt.trim(),
        caption: didascalia.trim() || undefined,
        credit: crediti.trim() || undefined,
      }),
    )
    try {
      const r = await fetch('/api/media', { method: 'POST', body: corpo, credentials: 'include' })
      const json = (await r.json().catch(() => ({}))) as {
        doc?: ImmagineMedia
        errors?: Array<{ message?: string }>
      }
      if (!r.ok || !json.doc) {
        throw new Error(json.errors?.[0]?.message || 'Caricamento non riuscito.')
      }
      onScegli(json.doc)
    } catch (err) {
      setErrore((err as Error).message)
    } finally {
      setInvio(false)
    }
  }

  if (!aperta) return null

  let corpo: ReactNode
  let azione: ReactNode

  if (scheda === 'archivio') {
    corpo = (
      <>
        <label className="media-scelta__cerca">
          <Icona nome="cerca" dimensione={16} />
          <input
            type="search"
            value={cerca}
            onChange={(e) => setCerca(e.currentTarget.value)}
            placeholder="Cerca per testo alternativo o nome del file"
            aria-label="Cerca nell’archivio"
          />
        </label>

        {!caricamento && elenco.length === 0 ? (
          <p className="nuovo__avviso">
            {cerca.trim()
              ? `Nessuna immagine trovata per «${cerca.trim()}».`
              : 'L’archivio è vuoto: carica la prima immagine.'}
          </p>
        ) : (
          <div className="media-scelta__griglia" role="radiogroup" aria-label="Immagini">
            {elenco.map((m) => {
              const attiva = (scelta?.id ?? selezionata) === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={attiva}
                  className="media-scelta__voce"
                  onClick={() => setScelta(m)}
                  onDoubleClick={() => onScegli(m)}
                >
                  <span className="media-scelta__miniatura">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={miniatura(m)} alt="" loading="lazy" />
                    <span className="nuovo__radio" aria-hidden="true" />
                  </span>
                  <b>{m.alt || m.filename}</b>
                  <span>
                    {m.width && m.height ? `${m.width}×${m.height} · ` : ''}
                    {m.createdAt ? data.format(new Date(m.createdAt)) : ''}
                  </span>
                </button>
              )
            })}
            {caricamento &&
              Array.from({ length: elenco.length ? 4 : 8 }, (_, i) => (
                <span key={`s${i}`} className="media-scelta__segnaposto" aria-hidden="true" />
              ))}
          </div>
        )}

        {altre && !caricamento && (
          <button
            type="button"
            className="nuovo__pulsante media-scelta__altre"
            onClick={() => void leggi(pagina + 1, cerca)}
          >
            Mostra altre immagini
          </button>
        )}
      </>
    )
    const daUsare = scelta ?? null
    azione = (
      <button
        type="button"
        className="nuovo__pulsante media-scelta__primario"
        disabled={!daUsare}
        onClick={() => daUsare && onScegli(daUsare)}
      >
        <Icona nome="spunta" dimensione={16} />
        Usa questa immagine
      </button>
    )
  } else {
    corpo = (
      <>
        <div
          className={`media-scelta__zona${trascina ? ' media-scelta__zona--sopra' : ''}${file ? ' media-scelta__zona--piena' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setTrascina(true)
          }}
          onDragLeave={() => setTrascina(false)}
          onDrop={lasciaFile}
        >
          {file && anteprima ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={anteprima} alt="" />
              <div className="media-scelta__file">
                <b>{file.name}</b>
                <span>{(file.size / 1024 / 1024).toFixed(1).replace('.', ',')} MB</span>
                <button
                  type="button"
                  className="media-scelta__collegamento"
                  onClick={() => scegliFile.current?.click()}
                >
                  Scegli un altro file
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="media-scelta__invito"
              onClick={() => scegliFile.current?.click()}
            >
              <span className="nuovo__opzione-icona">
                <Icona nome="immagine" />
              </span>
              <b>Trascina qui l’immagine</b>
              <span>oppure fai clic per sceglierla dal computer · JPG, PNG, WebP</span>
            </button>
          )}
          <input
            ref={scegliFile}
            type="file"
            accept={FORMATI}
            hidden
            onChange={(e) => {
              impostaFile(e.currentTarget.files?.[0] ?? null)
              e.currentTarget.value = ''
            }}
          />
        </div>

        <label className="nuovo__campo">
          <span className="nuovo__etichetta">Testo alternativo *</span>
          <input
            className="nuovo__select"
            value={alt}
            onChange={(e) => setAlt(e.currentTarget.value)}
            placeholder="Cosa mostra l’immagine, per chi non può vederla"
          />
          <span className="nuovo__aiuto">
            Obbligatorio: lo leggono gli screen reader e i motori di ricerca.
          </span>
        </label>
        <div className="nuovo__griglia">
          <label className="nuovo__campo">
            <span className="nuovo__etichetta">Didascalia</span>
            <input
              className="nuovo__select"
              value={didascalia}
              onChange={(e) => setDidascalia(e.currentTarget.value)}
            />
          </label>
          <label className="nuovo__campo">
            <span className="nuovo__etichetta">Crediti / fonte</span>
            <input
              className="nuovo__select"
              value={crediti}
              onChange={(e) => setCrediti(e.currentTarget.value)}
              placeholder="Es. Foto: Ansa"
            />
          </label>
        </div>
      </>
    )
    azione = (
      <button
        type="button"
        className="nuovo__pulsante media-scelta__primario"
        disabled={!file || !alt.trim() || invio}
        title={!file ? 'Scegli un file' : !alt.trim() ? 'Scrivi il testo alternativo' : undefined}
        onClick={() => void carica()}
      >
        {invio ? (
          'Caricamento…'
        ) : (
          <>
            <Icona nome="spunta" dimensione={16} />
            Carica e usa
          </>
        )}
      </button>
    )
  }

  return createPortal(
    <>
      <div className="nuovo__velo" onClick={invio ? undefined : onChiudi} />
      <div
        className="nuovo media-scelta"
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-scelta-titolo"
        ref={riquadro}
        tabIndex={-1}
      >
        <header className="nuovo__testa">
          <div>
            <p className="nuovo__etichetta">{etichetta}</p>
            <h2 id="media-scelta-titolo">
              {scheda === 'archivio' ? 'Scegli dall’archivio' : 'Carica un’immagine'}
            </h2>
          </div>
          <button
            type="button"
            className="nuovo__chiudi"
            aria-label="Chiudi"
            disabled={invio}
            onClick={onChiudi}
          >
            <Icona nome="chiudi" />
          </button>
        </header>

        <div className="media-scelta__schede">
          <div className="nuovo__segmenti" role="tablist" aria-label="Origine dell’immagine">
            {(
              [
                ['archivio', 'Archivio'],
                ['carica', 'Carica nuova'],
              ] as const
            ).map(([chiave, nome]) => (
              <button
                key={chiave}
                type="button"
                role="tab"
                aria-selected={scheda === chiave}
                aria-pressed={scheda === chiave}
                disabled={invio}
                onClick={() => {
                  setErrore(null)
                  setScheda(chiave)
                }}
              >
                {nome}
              </button>
            ))}
          </div>
        </div>

        {errore && (
          <p className="nuovo__errore" role="alert">
            {errore}
          </p>
        )}
        <div className="nuovo__corpo">{corpo}</div>
        <footer className="nuovo__piede">
          <button type="button" className="nuovo__pulsante" disabled={invio} onClick={onChiudi}>
            Annulla
          </button>
          {azione}
        </footer>
      </div>
    </>,
    document.body,
  )
}
