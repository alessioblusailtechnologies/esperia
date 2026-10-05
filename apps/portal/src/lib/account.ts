import type { AuthError } from '@supabase/supabase-js'

/**
 * Supporto comune alle pagine dell'area utente — RF-C-01, RF-C-02, RF-C-07.
 *
 * Le pagine sono isole che parlano direttamente con Supabase Auth: come per i
 * commenti, cio' che un utente puo' fare lo stabiliscono Supabase e le policy
 * RLS, non questi componenti.
 */

/** Pagine da cui non ha senso essere riportati dopo l'accesso: sarebbe un giro a vuoto. */
const PAGINE_DI_ACCESSO = /^\/(accedi|registrati|recupera-password|nuova-password)(\/|\?|$)/

/**
 * Destinazione dopo l'accesso, dal parametro `?ritorno=`.
 *
 * Solo percorsi interni: `//sito-altrui.it` o `/\sito-altrui.it` sono URL
 * assoluti per il browser, e accettarli farebbe del portale un trampolino per
 * il phishing ("accedi su Esperia" e ti ritrovi altrove, gia' fiducioso).
 */
export function ritornoSicuro(valore: string | null | undefined, predefinito = '/profilo'): string {
  if (!valore) return predefinito
  if (!valore.startsWith('/') || valore.startsWith('//') || valore.startsWith('/\\')) {
    return predefinito
  }
  if (PAGINE_DI_ACCESSO.test(valore)) return predefinito
  return valore
}

export function leggiRitorno(predefinito = '/profilo'): string {
  if (typeof window === 'undefined') return predefinito
  return ritornoSicuro(new URLSearchParams(window.location.search).get('ritorno'), predefinito)
}

/** Indirizzo assoluto di una pagina del portale, per i link che Supabase mette nelle email. */
export function indirizzoPortale(percorso: string): string {
  return new URL(percorso, window.location.origin).toString()
}

/**
 * Messaggio per il lettore a partire dall'errore di Supabase Auth.
 *
 * Il testo originale e' in inglese e pensato per sviluppatori. Le credenziali
 * sbagliate restano volutamente generiche: dire "questa email non esiste"
 * permetterebbe di scoprire chi e' iscritto.
 */
export function messaggioErrore(errore: AuthError | Error | null | undefined): string {
  if (!errore) return 'Operazione non riuscita. Riprova fra poco.'

  const codice = 'code' in errore ? (errore as AuthError).code : undefined

  switch (codice) {
    case 'invalid_credentials':
      return 'Email o password non corretti.'
    case 'email_not_confirmed':
      return 'Prima di accedere conferma l’indirizzo email: trovi il link nel messaggio che ti abbiamo inviato.'
    case 'weak_password':
      return 'La password è troppo debole: usane una più lunga, con lettere e numeri.'
    case 'same_password':
      return 'La nuova password deve essere diversa da quella attuale.'
    case 'email_address_invalid':
      return 'L’indirizzo email non è valido.'
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Troppi tentativi in poco tempo. Attendi qualche minuto e riprova.'
    case 'signup_disabled':
      return 'Le nuove registrazioni sono momentaneamente sospese.'
    case 'user_banned':
      return 'Questo account è stato sospeso.'
    case 'reauthentication_needed':
      return 'Per sicurezza esci e accedi di nuovo, poi ripeti il cambio della password.'
    case 'session_not_found':
    case 'session_expired':
    case 'otp_expired':
      return 'Il link è scaduto o è già stato usato. Richiedine uno nuovo.'
  }

  if (errore.message?.toLowerCase().includes('fetch')) {
    return 'Il servizio non è raggiungibile. Controlla la connessione e riprova.'
  }

  return 'Operazione non riuscita. Riprova fra poco.'
}
