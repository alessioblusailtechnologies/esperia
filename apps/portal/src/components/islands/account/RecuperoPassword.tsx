import { useMemo, useState } from 'preact/hooks'
import { getSupabase } from '@/lib/supabase'
import { indirizzoPortale, messaggioErrore } from '@/lib/account'

/**
 * Richiesta del link per reimpostare la password — RF-C-01.
 *
 * L'esito mostrato e' lo stesso che l'indirizzo sia registrato o no: e' cio'
 * che fa anche Supabase, e per la stessa ragione della registrazione.
 */
export default function RecuperoPassword() {
  const supabase = useMemo(() => getSupabase(), [])

  const [email, setEmail] = useState('')
  const [invio, setInvio] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [inviata, setInviata] = useState(false)

  if (!supabase) {
    return <p class="riquadro">Il recupero della password non è al momento disponibile.</p>
  }

  async function invia(e: Event) {
    e.preventDefault()
    if (!supabase) return
    setInvio(true)
    setErrore(null)

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: indirizzoPortale('/nuova-password'),
    })

    setInvio(false)
    if (error) {
      setErrore(messaggioErrore(error))
      return
    }
    setInviata(true)
  }

  if (inviata) {
    return (
      <div class="modulo">
        <p class="riquadro riquadro--ok" role="status">
          Se <strong>{email.trim()}</strong> corrisponde a un account, riceverai a breve un’email
          con il link per scegliere una nuova password.
        </p>
        <p class="modulo__link">
          <a href="/accedi">Torna all’accesso</a>
        </p>
      </div>
    )
  }

  return (
    <form class="modulo" onSubmit={invia} noValidate>
      {errore && (
        <p class="riquadro riquadro--errore" role="alert">
          {errore}
        </p>
      )}

      <div class="campo">
        <label class="campo__etichetta" for="recupero-email">
          Email dell’account
        </label>
        <input
          id="recupero-email"
          type="email"
          autocomplete="email"
          required
          value={email}
          onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
        />
      </div>

      <div class="modulo__azioni">
        <button type="submit" class="bottone" disabled={invio || !email.trim()}>
          {invio ? 'Invio…' : 'Invia il link'}
        </button>
        <span class="modulo__link">
          <a href="/accedi">Torna all’accesso</a>
        </span>
      </div>
    </form>
  )
}
