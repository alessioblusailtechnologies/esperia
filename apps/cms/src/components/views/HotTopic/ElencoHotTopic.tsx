'use client'

import { useMemo, useState, useTransition } from 'react'

import { PannelloProposta } from '../PannelloProposta'
import { proponiDaHotTopic, scartaHotTopic, type Proposta } from '../azioniAi'

export interface ArgomentoVista {
  id: string
  titolo: string
  sintesi: string
  punteggio: number
  stato: string
  rilevatoIl: string | null
  paroleChiave: string[]
  categoriaSuggerita: { id: string; nome: string } | null
  fonti: Array<{ titolo: string; url: string; testata: string }>
}

/**
 * Elenco degli argomenti proposti — dai design (Hot Topic v1).
 *
 * Il filtro per ambito e finestra temporale lavora sui dati già in pagina:
 * gli argomenti aperti sono al massimo qualche decina e filtrare lato client
 * evita un giro di rete per ogni clic su una pastiglia.
 */

const relativo = new Intl.RelativeTimeFormat('it-IT', { numeric: 'auto' })

function quando(iso: string | null): string {
  if (!iso) return 'data ignota'
  const ore = Math.round((new Date(iso).getTime() - Date.now()) / 3_600_000)
  if (Math.abs(ore) < 24) return relativo.format(ore, 'hour')
  return relativo.format(Math.round(ore / 24), 'day')
}

const FINESTRE = [
  { chiave: '24h', etichetta: '24 ore', ore: 24 },
  { chiave: '7g', etichetta: '7 giorni', ore: 24 * 7 },
  { chiave: '30g', etichetta: '30 giorni', ore: 24 * 30 },
  { chiave: 'tutto', etichetta: 'Tutto', ore: Number.POSITIVE_INFINITY },
] as const

function fascia(p: number): 'alta' | 'media' | 'bassa' {
  if (p >= 70) return 'alta'
  if (p >= 45) return 'media'
  return 'bassa'
}

export function ElencoHotTopic({
  argomenti,
  categorie,
}: {
  argomenti: ArgomentoVista[]
  categorie: Array<{ id: string; nome: string }>
}) {
  const [ambito, setAmbito] = useState<string>('')
  const [finestra, setFinestra] = useState<string>('7g')
  const [scartati, setScartati] = useState<Set<string>>(new Set())
  const [messaggio, setMessaggio] = useState<{ tipo: 'ok' | 'errore'; testo: string } | null>(null)

  const [inGenerazione, setInGenerazione] = useState<string | null>(null)
  const [proposta, setProposta] = useState<{ argomento: ArgomentoVista; dati: Proposta } | null>(
    null,
  )
  const [inCorso, avvia] = useTransition()

  const visibili = useMemo(() => {
    const oreMax = FINESTRE.find((f) => f.chiave === finestra)?.ore ?? Number.POSITIVE_INFINITY

    return argomenti.filter((a) => {
      if (scartati.has(a.id)) return false
      if (ambito && a.categoriaSuggerita?.id !== ambito) return false
      if (oreMax !== Number.POSITIVE_INFINITY) {
        if (!a.rilevatoIl) return false
        const ore = (Date.now() - new Date(a.rilevatoIl).getTime()) / 3_600_000
        if (ore > oreMax) return false
      }
      return true
    })
  }, [argomenti, ambito, finestra, scartati])

  function genera(a: ArgomentoVista) {
    setInGenerazione(a.id)
    setMessaggio(null)
    avvia(async () => {
      const esito = await proponiDaHotTopic(a.id)
      setInGenerazione(null)
      if (esito.ok) setProposta({ argomento: a, dati: esito.dati })
      else setMessaggio({ tipo: 'errore', testo: esito.messaggio })
    })
  }

  function scarta(a: ArgomentoVista) {
    const motivo = window.prompt(
      `Perché scarti «${a.titolo}»?\nLa risposta serve a tarare i criteri di rilevanza.`,
      '',
    )
    if (motivo === null) return

    avvia(async () => {
      const esito = await scartaHotTopic(a.id, motivo)
      if (esito.ok) {
        setScartati((p) => new Set(p).add(a.id))
        setMessaggio({ tipo: 'ok', testo: 'Argomento scartato.' })
      } else {
        setMessaggio({ tipo: 'errore', testo: esito.messaggio })
      }
    })
  }

  /* --- Pannello della proposta generata ---------------------------------- */
  if (proposta) {
    return (
      <div className="ai-vista__corpo">
        <PannelloProposta
          proposta={proposta.dati}
          categorie={categorie}
          categoriaIniziale={proposta.argomento.categoriaSuggerita?.id ?? null}
          hotTopicId={proposta.argomento.id}
          origine={`Argomento: ${proposta.argomento.titolo}`}
          onChiudi={() => setProposta(null)}
        />
      </div>
    )
  }

  return (
    <div className="ai-vista__corpo">
      {messaggio && (
        <p className={`ai-messaggio ai-messaggio--${messaggio.tipo}`} role="status">
          {messaggio.testo}
        </p>
      )}

      <div className="ai-filtri">
        <span className="ai-filtri__etichetta">Ambito</span>
        <div className="ai-filtri__gruppo">
          <button
            type="button"
            className={`pastiglia-filtro${ambito === '' ? ' pastiglia-filtro--attiva' : ''}`}
            onClick={() => setAmbito('')}
          >
            Tutti
          </button>
          {categorie.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`pastiglia-filtro${ambito === c.id ? ' pastiglia-filtro--attiva' : ''}`}
              onClick={() => setAmbito(c.id)}
            >
              {c.nome}
            </button>
          ))}
        </div>

        <span className="ai-filtri__separatore" aria-hidden="true" />
        <span className="ai-filtri__etichetta">Finestra</span>
        <div className="ai-filtri__segmenti">
          {FINESTRE.map((f) => (
            <button
              key={f.chiave}
              type="button"
              className={`segmento${finestra === f.chiave ? ' segmento--attivo' : ''}`}
              onClick={() => setFinestra(f.chiave)}
            >
              {f.etichetta}
            </button>
          ))}
        </div>

        <span className="ai-filtri__conteggio">
          {visibili.length} {visibili.length === 1 ? 'argomento' : 'argomenti'}
        </span>
      </div>

      {visibili.length === 0 ? (
        <div className="ai-vuoto">
          <h2>Nessun argomento in questa finestra</h2>
          <p>
            Prova ad allargare l’intervallo o a togliere il filtro per ambito. La rilevazione
            gira periodicamente sulle fonti configurate in Impostazioni AI.
          </p>
        </div>
      ) : (
        visibili.map((a) => (
          <article key={a.id} className="argomento">
            <div className="argomento__testa">
              <div className="argomento__principale">
                <div className="argomento__contesto">
                  {a.categoriaSuggerita && (
                    <span className="argomento__ambito">{a.categoriaSuggerita.nome}</span>
                  )}
                  <span className="argomento__quando">· rilevato {quando(a.rilevatoIl)}</span>
                  <span className="argomento__badge">
                    {a.stato === 'in_lavorazione' ? 'In lavorazione' : 'Proposta'}
                  </span>
                </div>

                <h2 className="argomento__titolo">{a.titolo}</h2>
                {a.sintesi && <p className="argomento__sintesi">{a.sintesi}</p>}
              </div>

              <div className="rilevanza">
                <div className="rilevanza__testa">
                  <span className="rilevanza__etichetta">Rilevanza</span>
                  <span className={`rilevanza__valore rilevanza__valore--${fascia(a.punteggio)}`}>
                    {a.punteggio}
                  </span>
                </div>
                <div className="rilevanza__barra">
                  <span
                    className={`rilevanza__pieno rilevanza__pieno--${fascia(a.punteggio)}`}
                    style={{ width: `${Math.min(100, Math.max(2, a.punteggio))}%` }}
                  />
                </div>
                <span className="rilevanza__nota">
                  {a.paroleChiave.length > 0
                    ? a.paroleChiave.slice(0, 3).join(', ')
                    : 'nessuna parola chiave'}
                </span>
              </div>
            </div>

            {a.fonti.length > 0 && (
              <div className="argomento__fonti">
                <span className="argomento__fonti-etichetta">Fonti</span>
                {a.fonti.slice(0, 4).map((f, i) => (
                  <a
                    key={`${f.url}-${i}`}
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={f.titolo}
                  >
                    {f.testata || new URL(f.url || 'https://esempio.it').hostname}
                    <span aria-hidden="true"> ↗</span>
                  </a>
                ))}
                {a.fonti.length > 4 && (
                  <span className="argomento__fonti-altre">
                    e altre {a.fonti.length - 4}
                  </span>
                )}
              </div>
            )}

            <div className="argomento__azioni">
              <button
                type="button"
                className="azione azione--primaria"
                disabled={inCorso}
                onClick={() => genera(a)}
              >
                {inGenerazione === a.id ? 'Sto scrivendo…' : 'Genera bozza'}
              </button>
              <a className="azione" href={`/admin/collections/hot-topics/${a.id}`}>
                Approfondisci
              </a>
              <button
                type="button"
                className="azione azione--tenue"
                disabled={inCorso}
                onClick={() => scarta(a)}
              >
                Ignora
              </button>
              <span className="argomento__nota">
                La bozza generata resta da revisionare: non raggiunge il portale da sola.
              </span>
            </div>
          </article>
        ))
      )}
    </div>
  )
}

export default ElencoHotTopic
