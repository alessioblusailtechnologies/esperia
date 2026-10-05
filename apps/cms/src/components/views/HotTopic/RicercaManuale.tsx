'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Icona } from '@/components/Icona'
import { cercaHotTopicOra } from '../azioniAi'

/*
 * L'aggiornamento dell'elenco ricrea questo componente e ne perderebbe lo
 * stato: il risultato passa per sessionStorage e si rilegge al montaggio,
 * purché recente.
 */
const CHIAVE_ESITO = 'esperia.ricerca-hot-topic'
type EsitoMostrato = { tipo: 'ok' | 'errore'; testo: string }

function ricordaEsito(e: EsitoMostrato) {
  try {
    sessionStorage.setItem(CHIAVE_ESITO, JSON.stringify({ ...e, quando: Date.now() }))
  } catch {
    /* senza storage il messaggio dura finché la pagina non si aggiorna */
  }
}

/**
 * «Cerca ora» nella testata degli Hot topic.
 *
 * Il rilevamento gira da solo ogni 5 minuti; questo pulsante lo lancia subito
 * su tutte le fonti attive, per quando in redazione arriva una notizia e non
 * si vuole aspettare il giro. Alla fine dice cosa ha trovato e ricarica
 * l'elenco.
 */
export function RicercaManuale() {
  const router = useRouter()
  const [inCorso, avvia] = useTransition()
  const [esito, setEsito] = useState<EsitoMostrato | null>(null)

  useEffect(() => {
    try {
      const salvato = JSON.parse(sessionStorage.getItem(CHIAVE_ESITO) ?? 'null') as
        (EsitoMostrato & { quando: number }) | null
      if (salvato && Date.now() - salvato.quando < 60_000) {
        setEsito({ tipo: salvato.tipo, testo: salvato.testo })
      }
    } catch {
      /* niente da recuperare */
    }
  }, [])

  function cerca() {
    setEsito(null)
    avvia(async () => {
      const r = await cercaHotTopicOra()
      if (!r.ok) {
        setEsito({ tipo: 'errore', testo: r.messaggio })
        return
      }

      const d = r.dati
      // Il contatore conta argomenti, non notizie: il messaggio dice dove sono
      // finite le notizie nuove, altrimenti «1 notizia nuova» con il contatore
      // fermo sembra un errore.
      const isolate = d.notizieNuove - d.notizieInArgomenti
      const parti = [`${d.fontiLette} ${d.fontiLette === 1 ? 'fonte letta' : 'fonti lette'}`]
      parti.push(
        d.notizieNuove === 0
          ? 'nessuna notizia nuova'
          : `${d.notizieNuove} ${d.notizieNuove === 1 ? 'notizia nuova' : 'notizie nuove'}`,
      )
      if (d.argomentiCreati) {
        parti.push(
          `${d.argomentiCreati} ${d.argomentiCreati === 1 ? 'argomento nuovo' : 'argomenti nuovi'}`,
        )
      }
      if (d.argomentiAggiornati) {
        parti.push(
          d.argomentiAggiornati === 1
            ? '1 argomento già in elenco ha nuove fonti'
            : `${d.argomentiAggiornati} argomenti già in elenco hanno nuove fonti`,
        )
      }
      if (!d.argomentiCreati && !d.argomentiAggiornati) parti.push('nessun argomento nuovo')
      if (isolate > 0) {
        parti.push(
          isolate === 1
            ? '1 notizia ancora da sola: diventa argomento quando la riprende un’altra testata'
            : `${isolate} notizie ancora da sole: diventano argomento quando le riprende un’altra testata`,
        )
      }
      if (d.fontiInErrore) {
        parti.push(`${d.fontiInErrore} ${d.fontiInErrore === 1 ? 'fonte' : 'fonti'} in errore`)
      }

      const nuovo: EsitoMostrato = {
        tipo: d.fontiInErrore ? 'errore' : 'ok',
        testo: parti.join(' · '),
      }
      setEsito(nuovo)
      ricordaEsito(nuovo)
      router.refresh()
    })
  }

  return (
    <div className="ricerca-manuale">
      <button type="button" className="azione azione--primaria" disabled={inCorso} onClick={cerca}>
        {inCorso ? (
          <>
            <span className="ricerca-manuale__ruota" aria-hidden="true" />
            Sto leggendo le fonti…
          </>
        ) : (
          <>
            <Icona nome="rss" dimensione={15} />
            Cerca ora
          </>
        )}
      </button>
      {esito && (
        <p className={`ricerca-manuale__esito ricerca-manuale__esito--${esito.tipo}`} role="status">
          {esito.testo}
        </p>
      )}
    </div>
  )
}

export default RicercaManuale
