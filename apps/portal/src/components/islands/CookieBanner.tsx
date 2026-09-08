import { useEffect, useRef, useState } from 'preact/hooks'

/**
 * Banner cookie e gestione dei consensi — RF-P-09, RNF-04.
 * Impaginazione dai design (Home v1, stati "Banner consenso" e "Gestione granulare").
 *
 * Regole applicate:
 *  - nessuno script non necessario parte prima del consenso;
 *  - rifiutare costa un clic quanto accettare, con la stessa evidenza grafica
 *    (nei design i due bottoni sono identici: non è un dettaglio estetico, è
 *    ciò che distingue un banner conforme da un dark pattern);
 *  - la scelta è revocabile: "Preferenze cookie" nel footer riapre il pannello;
 *  - i cookie tecnici non sono opzionali e non vengono presentati come tali.
 *
 * Le tre finalità sono quelle effettivamente presenti nel perimetro. Non c'è
 * una voce "profilazione pubblicitaria" perché la monetizzazione è fuori
 * perimetro (§6 dell'analisi): elencarla sarebbe dichiarare un trattamento che
 * non avviene.
 */

const CHIAVE = 'esperia.consensi.v1'
const VERSIONE = 1

export interface Consensi {
  versione: number
  misurazione: boolean
  contenutiTerzi: boolean
  decisoIl: string
}

export const EVENTO_CONSENSO = 'esperia:consenso'

export function leggiConsensi(): Consensi | null {
  try {
    const raw = localStorage.getItem(CHIAVE)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Consensi
    // Se cambiano le finalità, il consenso precedente non è più valido.
    if (parsed.versione !== VERSIONE) return null
    return parsed
  } catch {
    return null
  }
}

function salvaConsensi(consensi: Consensi): void {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(consensi))
  } catch {
    /* navigazione privata o storage bloccato: la scelta vale per questa sessione */
  }
  window.dispatchEvent(new CustomEvent(EVENTO_CONSENSO, { detail: consensi }))
}

function caricaGoogleAnalytics(measurementId: string): void {
  if (document.getElementById('ga4-script')) return

  const s = document.createElement('script')
  s.id = 'ga4-script'
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`
  document.head.appendChild(s)

  const w = window as unknown as { dataLayer?: unknown[] }
  w.dataLayer = w.dataLayer || []
  function gtag(...args: unknown[]) {
    w.dataLayer!.push(args)
  }
  gtag('js', new Date())
  // Consent Mode: dichiariamo esplicitamente cosa è stato concesso.
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'granted',
  })
  gtag('config', measurementId, { anonymize_ip: true })
}

interface Props {
  message: string
  cookiePolicyHref: string | null
  privacyPolicyHref: string | null
  gaMeasurementId: string | null
}

function Interruttore({
  attivo,
  onToggle,
  etichetta,
}: {
  attivo: boolean
  onToggle: () => void
  etichetta: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={attivo}
      aria-label={etichetta}
      class={`interruttore${attivo ? ' interruttore--attivo' : ''}`}
      onClick={onToggle}
    >
      <span class="interruttore__pallino" />
    </button>
  )
}

export default function CookieBanner({
  message,
  cookiePolicyHref,
  privacyPolicyHref,
  gaMeasurementId,
}: Props) {
  const [visibile, setVisibile] = useState(false)
  const [preferenze, setPreferenze] = useState(false)
  const [misurazione, setMisurazione] = useState(false)
  const [contenutiTerzi, setContenutiTerzi] = useState(false)
  const primoBottone = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const esistente = leggiConsensi()
    if (!esistente) {
      setVisibile(true)
      return
    }
    setMisurazione(esistente.misurazione)
    setContenutiTerzi(esistente.contenutiTerzi)
    if (esistente.misurazione && gaMeasurementId) caricaGoogleAnalytics(gaMeasurementId)
    // Notifica gli embed già presenti in pagina.
    window.dispatchEvent(new CustomEvent(EVENTO_CONSENSO, { detail: esistente }))
  }, [gaMeasurementId])

  // "Preferenze cookie" nel footer riapre il pannello. RNF-04
  useEffect(() => {
    const riapri = () => {
      setVisibile(true)
      setPreferenze(true)
    }
    window.addEventListener('esperia:apri-preferenze', riapri)
    return () => window.removeEventListener('esperia:apri-preferenze', riapri)
  }, [])

  // Il pannello è modale: Esc lo chiude e il focus ci entra all'apertura.
  useEffect(() => {
    if (!preferenze) return
    primoBottone.current?.focus()
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreferenze(false)
    }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [preferenze])

  function applica(scelta: { misurazione: boolean; contenutiTerzi: boolean }) {
    const consensi: Consensi = {
      versione: VERSIONE,
      misurazione: scelta.misurazione,
      contenutiTerzi: scelta.contenutiTerzi,
      decisoIl: new Date().toISOString(),
    }
    salvaConsensi(consensi)
    if (consensi.misurazione && gaMeasurementId) caricaGoogleAnalytics(gaMeasurementId)
    setVisibile(false)
    setPreferenze(false)
  }

  if (!visibile) return null

  /* ---------------------------------------------------------------------- */

  if (preferenze) {
    return (
      <div class="velo" onClick={(e) => e.target === e.currentTarget && setPreferenze(false)}>
        <div class="preferenze" role="dialog" aria-modal="true" aria-labelledby="pref-titolo">
          <h2 id="pref-titolo" class="preferenze__titolo">Preferenze cookie</h2>

          <div class="preferenze__righe">
            <div class="preferenze__riga">
              <div>
                <p class="preferenze__nome">Tecnici</p>
                <p class="preferenze__desc">Necessari al funzionamento del sito.</p>
              </div>
              <span class="preferenze__sempre">Sempre attivi</span>
            </div>

            <div class="preferenze__riga">
              <div>
                <p class="preferenze__nome">Statistiche</p>
                <p class="preferenze__desc">Misurazione anonima e aggregata del traffico.</p>
              </div>
              <Interruttore
                attivo={misurazione}
                onToggle={() => setMisurazione((v) => !v)}
                etichetta="Consenti i cookie di statistica"
              />
            </div>

            <div class="preferenze__riga">
              <div>
                <p class="preferenze__nome">Contenuti di terze parti</p>
                <p class="preferenze__desc">
                  Video e post social incorporati negli articoli. Senza consenso restano
                  sostituiti da un segnaposto.
                </p>
              </div>
              <Interruttore
                attivo={contenutiTerzi}
                onToggle={() => setContenutiTerzi((v) => !v)}
                etichetta="Consenti i contenuti di terze parti"
              />
            </div>
          </div>

          <div class="preferenze__azioni">
            <button
              type="button"
              ref={primoBottone}
              class="bottone bottone--fantasma"
              onClick={() => applica({ misurazione: false, contenutiTerzi: false })}
            >
              Rifiuta tutto
            </button>
            <button
              type="button"
              class="bottone bottone--pieno"
              onClick={() => applica({ misurazione, contenutiTerzi })}
            >
              Salva le preferenze
            </button>
          </div>

          {(cookiePolicyHref || privacyPolicyHref) && (
            <p class="preferenze__link">
              {cookiePolicyHref && <a href={cookiePolicyHref}>Cookie policy</a>}
              {cookiePolicyHref && privacyPolicyHref && ' · '}
              {privacyPolicyHref && <a href={privacyPolicyHref}>Privacy policy</a>}
            </p>
          )}
        </div>

        <style>{stili}</style>
      </div>
    )
  }

  return (
    <div class="banda" role="region" aria-label="Informativa cookie">
      <div class="banda__pannello">
        <div class="banda__testo">
          <p class="banda__titolo">Su questo sito usiamo i cookie</p>
          <p class="banda__messaggio">{message}</p>
          <button type="button" class="banda__gestisci" onClick={() => setPreferenze(true)}>
            Gestisci le preferenze
          </button>
        </div>

        <div class="banda__azioni">
          <button
            type="button"
            class="bottone bottone--inverso"
            onClick={() => applica({ misurazione: false, contenutiTerzi: false })}
          >
            Rifiuta
          </button>
          <button
            type="button"
            class="bottone bottone--inverso"
            onClick={() => applica({ misurazione: true, contenutiTerzi: true })}
          >
            Accetta
          </button>
        </div>
      </div>

      <style>{stili}</style>
    </div>
  )
}

const stili = `
  .banda {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    padding: clamp(12px, 2vw, 20px);
    display: flex;
    justify-content: center;
    pointer-events: none;
    z-index: 50;
  }
  .banda__pannello {
    pointer-events: auto;
    width: 100%;
    max-width: var(--larghezza-media);
    background: var(--colore-inverso);
    color: var(--colore-testo-inverso);
    border-radius: var(--raggio-lg);
    padding: clamp(18px, 2vw, 24px) clamp(18px, 2.4vw, 28px);
    display: flex;
    align-items: center;
    gap: clamp(16px, 2.4vw, 32px);
    flex-wrap: wrap;
    box-shadow: var(--ombra-banner);
  }
  .banda__testo { display: flex; flex-direction: column; gap: 7px; flex: 1; min-width: 260px; }
  .banda__titolo { font-size: 14.5px; font-weight: var(--peso-forte); }
  .banda__messaggio {
    font-size: 13px;
    line-height: var(--interlinea-normale);
    color: var(--colore-bordo-forte);
    max-width: 62ch;
  }
  .banda__gestisci {
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    font-size: var(--testo-sm);
    font-weight: var(--peso-medio);
    color: var(--colore-rss);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
    width: fit-content;
  }
  .banda__gestisci:hover { color: var(--colore-testo-inverso); }
  .banda__azioni { display: flex; gap: 10px; flex-wrap: wrap; }

  .bottone {
    font: inherit;
    font-size: 13px;
    font-weight: var(--peso-forte);
    border-radius: var(--raggio-pill);
    padding: 11px 24px;
    cursor: pointer;
    text-align: center;
    min-width: 130px;
  }
  .bottone--inverso {
    border: 1px solid var(--colore-bordo-inverso);
    background: none;
    color: var(--colore-testo-inverso);
  }
  .bottone--inverso:hover { border-color: var(--colore-testo-inverso); }
  .bottone--fantasma {
    border: 1px solid var(--colore-bordo-forte);
    background: none;
    color: var(--colore-testo);
  }
  .bottone--fantasma:hover { border-color: var(--colore-testo); }
  .bottone--pieno {
    border: 1px solid var(--colore-inverso);
    background: var(--colore-inverso);
    color: var(--colore-testo-inverso);
  }
  .bottone--pieno:hover { background: var(--colore-inverso-hover); }

  .velo {
    position: fixed;
    inset: 0;
    background: var(--velo-modale);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: clamp(12px, 2vw, 24px);
    z-index: 60;
  }
  .preferenze {
    width: 100%;
    max-width: 560px;
    background: var(--colore-fondo);
    border-radius: var(--raggio-lg);
    padding: clamp(20px, 2.4vw, 28px);
    display: flex;
    flex-direction: column;
    gap: var(--spazio-5);
    box-shadow: var(--ombra-modale);
    max-height: 90vh;
    overflow-y: auto;
  }
  .preferenze__titolo {
    font-family: var(--font-titoli);
    font-size: 24px;
    font-weight: var(--peso-forte);
  }
  .preferenze__righe { display: flex; flex-direction: column; }
  .preferenze__riga {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 0;
    border-top: 1px solid var(--colore-bordo);
  }
  .preferenze__riga:last-child { border-bottom: 1px solid var(--colore-bordo); }
  .preferenze__riga > div { flex: 1; }
  .preferenze__nome { font-size: var(--testo-base); font-weight: var(--peso-forte); }
  .preferenze__desc {
    font-size: 12px;
    color: var(--colore-testo-meta);
    line-height: 1.45;
  }
  .preferenze__sempre {
    font-size: 11px;
    font-weight: var(--peso-forte);
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--colore-testo-meta);
  }
  .preferenze__azioni { display: flex; gap: 10px; flex-wrap: wrap; }
  .preferenze__link { font-size: var(--testo-xs); }
  .preferenze__link a { text-decoration: underline; text-underline-offset: 2px; }

  .interruttore {
    width: 46px;
    height: 26px;
    border-radius: var(--raggio-pill);
    padding: 3px;
    border: 0;
    cursor: pointer;
    background: var(--colore-interruttore-spento);
    display: flex;
    flex-shrink: 0;
    transition: background var(--transizione);
  }
  .interruttore--attivo { background: var(--colore-accento); }
  .interruttore__pallino {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--colore-fondo);
    transition: transform var(--transizione);
  }
  .interruttore--attivo .interruttore__pallino { transform: translateX(20px); }
`
