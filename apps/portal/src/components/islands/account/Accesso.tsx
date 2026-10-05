import { useEffect, useMemo, useState } from 'preact/hooks'
import { getSupabase } from '@/lib/supabase'
import { leggiRitorno, messaggioErrore } from '@/lib/account'

/**
 * Accesso alla community con email e password — RF-C-01.
 *
 * Chi arriva qui con una sessione gia' aperta viene mandato subito a
 * destinazione. Succede in due casi: il lettore che clicca "Accedi" in testata
 * (la testata e' identica per tutti, senza JavaScript, e non sa se e' gia'
 * dentro), e chi conferma l'email dal link di registrazione, che riporta qui
 * con i token nell'indirizzo: Supabase apre la sessione da solo.
 */
export default function Accesso() {
  const supabase = useMemo(() => getSupabase(), [])
  const ritorno = useMemo(() => leggiRitorno(), [])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [invio, setInvio] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace(ritorno)
    })
    const { data } = supabase.auth.onAuthStateChange((evento, sessione) => {
      if (evento === 'SIGNED_IN' && sessione) window.location.replace(ritorno)
    })
    return () => data.subscription.unsubscribe()
  }, [supabase, ritorno])

  if (!supabase) {
    return <p class="riquadro">L’accesso all’area riservata non è al momento disponibile.</p>
  }

  async function accedi(e: Event) {
    e.preventDefault()
    if (!supabase) return
    setInvio(true)
    setErrore(null)

    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })

    if (error) {
      setInvio(false)
      setErrore(messaggioErrore(error))
      return
    }
    // Il reindirizzamento lo fa onAuthStateChange: un solo punto, anche per il link email.
  }

  const qs = ritorno === '/profilo' ? '' : `?ritorno=${encodeURIComponent(ritorno)}`

  return (
    <form class="modulo" onSubmit={accedi} noValidate>
      {errore && (
        <p class="riquadro riquadro--errore" role="alert">
          {errore}
        </p>
      )}

      <div class="campo">
        <label class="campo__etichetta" for="accesso-email">
          Email
        </label>
        <input
          id="accesso-email"
          type="email"
          autocomplete="email"
          required
          value={email}
          onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
        />
      </div>

      <div class="campo">
        <label class="campo__etichetta" for="accesso-password">
          Password
        </label>
        <input
          id="accesso-password"
          type="password"
          autocomplete="current-password"
          required
          value={password}
          onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
        />
        <span class="modulo__link">
          <a href="/recupera-password">Hai dimenticato la password?</a>
        </span>
      </div>

      <div class="modulo__azioni">
        <button type="submit" class="bottone" disabled={invio || !email.trim() || !password}>
          {invio ? 'Accesso…' : 'Accedi'}
        </button>
        <span class="modulo__link">
          Non hai un account? <a href={`/registrati${qs}`}>Registrati</a>
        </span>
      </div>
    </form>
  )
}
