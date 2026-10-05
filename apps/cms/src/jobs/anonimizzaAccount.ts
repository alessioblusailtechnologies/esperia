import type { TaskConfig } from 'payload'
import { anonimizzaUtente, communityConfigurata, richiesteCancellazione } from '@/lib/supabase'

interface EsitoAnonimizzazione {
  eseguite: number
  fallite: number
}

/**
 * Esecuzione delle richieste di cancellazione account — RF-C-07.
 *
 * L'utente chiede la cancellazione dal profilo (`request_account_deletion`),
 * che registra soltanto la data: l'esecuzione e' asincrona perche' tocca anche
 * cio' che l'utente ha scritto, e perche' la funzione che cancella da
 * `auth.users` non deve essere richiamabile dal browser. Il profilo promette
 * "entro 24 ore": il job gira ogni ora, cosi' la promessa regge anche se
 * qualche giro salta.
 *
 * Il registro operazioni non riceve una voce per utente: conterrebbe l'id di
 * una persona che ha appena chiesto di non essere piu' riconducibile.
 */
export const anonimizzaAccountTask: TaskConfig<{ input: object; output: EsitoAnonimizzazione }> = {
  slug: 'anonimizza-account',
  label: 'Cancellazione account richiesti',
  retries: 0,
  schedule: [{ cron: '0 * * * *', queue: 'default' }],
  handler: async ({ req }) => {
    const esito: EsitoAnonimizzazione = { eseguite: 0, fallite: 0 }
    if (!communityConfigurata()) return { output: esito }

    for (const id of await richiesteCancellazione()) {
      try {
        await anonimizzaUtente(id)
        esito.eseguite++
      } catch (err) {
        esito.fallite++
        // Niente id nel log, per la stessa ragione del registro: basta il conteggio.
        req.payload.logger.error(`[cancellazione account] fallita: ${(err as Error).message}`)
      }
    }

    if (esito.eseguite || esito.fallite) {
      req.payload.logger.info({ msg: '[cancellazione account] giro completato', ...esito })
    }
    return { output: esito }
  },
}
