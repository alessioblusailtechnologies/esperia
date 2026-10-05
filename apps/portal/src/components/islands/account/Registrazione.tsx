import { useEffect, useMemo, useState } from 'preact/hooks'
import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@esperia/shared'
import { getSupabase } from '@/lib/supabase'
import { indirizzoPortale, leggiRitorno, messaggioErrore } from '@/lib/account'

/**
 * Registrazione alla community — RF-C-01.
 *
 * Il nome scelto qui viaggia nei metadati dell'utente: lo legge il trigger
 * `handle_new_user`, che crea il profilo pubblico nel momento stesso in cui
 * nasce l'account. Il portale non scrive mai nella tabella dei profili per
 * crearli.
 *
 * Dopo l'invio il messaggio e' sempre lo stesso, anche se l'email e' gia'
 * registrata: Supabase in quel caso non segnala errore apposta, e dire "questa
 * email esiste gia'" permetterebbe di scoprire chi e' iscritto.
 */
export default function Registrazione() {
  const supabase = useMemo(() => getSupabase(), [])
  const ritorno = useMemo(() => leggiRitorno(), [])

  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [consenso, setConsenso] = useState(false)
  const [invio, setInvio] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [inviataA, setInviataA] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace(ritorno)
    })
  }, [supabase, ritorno])

  if (!supabase) {
    return <p class="riquadro">La registrazione non è al momento disponibile.</p>
  }

  if (inviataA) {
    return (
      <div class="modulo">
        <p class="riquadro riquadro--ok" role="status">
          Ti abbiamo scritto a <strong>{inviataA}</strong>. Apri il link nel messaggio per
          confermare l’indirizzo e completare la registrazione.
        </p>
        <p class="modulo__testo">
          Non trovi l’email? Controlla nella posta indesiderata. Il link vale per un tempo limitato:
          se scade, registrati di nuovo con lo stesso indirizzo.
        </p>
      </div>
    )
  }

  const nomePulito = nome.trim()
  const nomeValido =
    nomePulito.length >= DISPLAY_NAME_MIN_LENGTH && nomePulito.length <= DISPLAY_NAME_MAX_LENGTH
  const passwordValida = password.length >= PASSWORD_MIN_LENGTH
  const completo = nomeValido && email.trim() && passwordValida && consenso

  async function registra(e: Event) {
    e.preventDefault()
    if (!supabase || !completo) return
    setInvio(true)
    setErrore(null)

    const indirizzo = email.trim()
    const { data, error } = await supabase.auth.signUp({
      email: indirizzo,
      password,
      options: {
        // `app` dice al trigger che e' un lettore di esperia: il progetto
        // Supabase puo' essere condiviso con altre applicazioni.
        data: { display_name: nomePulito, app: 'esperia' },
        // Il link di conferma riporta su /accedi, che apre la sessione e prosegue.
        emailRedirectTo: indirizzoPortale(`/accedi?ritorno=${encodeURIComponent(ritorno)}`),
      },
    })

    setInvio(false)

    if (error) {
      setErrore(messaggioErrore(error))
      return
    }

    // Progetto configurato senza conferma email: l'utente e' gia' dentro.
    if (data.session) {
      window.location.replace(ritorno)
      return
    }

    setInviataA(indirizzo)
  }

  return (
    <form class="modulo" onSubmit={registra} noValidate>
      {errore && (
        <p class="riquadro riquadro--errore" role="alert">
          {errore}
        </p>
      )}

      <div class="campo">
        <label class="campo__etichetta" for="reg-nome">
          Nome pubblico
        </label>
        <input
          id="reg-nome"
          type="text"
          autocomplete="nickname"
          required
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          value={nome}
          onInput={(e) => setNome((e.target as HTMLInputElement).value)}
          aria-describedby="reg-nome-aiuto"
        />
        <span class="campo__aiuto" id="reg-nome-aiuto">
          Compare accanto ai tuoi commenti. Puoi usare nome e cognome o uno pseudonimo, da{' '}
          {DISPLAY_NAME_MIN_LENGTH} a {DISPLAY_NAME_MAX_LENGTH} caratteri.
        </span>
      </div>

      <div class="campo">
        <label class="campo__etichetta" for="reg-email">
          Email
        </label>
        <input
          id="reg-email"
          type="email"
          autocomplete="email"
          required
          value={email}
          onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
          aria-describedby="reg-email-aiuto"
        />
        <span class="campo__aiuto" id="reg-email-aiuto">
          Non viene mai mostrata pubblicamente.
        </span>
      </div>

      <div class="campo">
        <label class="campo__etichetta" for="reg-password">
          Password
        </label>
        <input
          id="reg-password"
          type="password"
          autocomplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          value={password}
          onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
          aria-describedby="reg-password-aiuto"
        />
        <span class="campo__aiuto" id="reg-password-aiuto">
          Almeno {PASSWORD_MIN_LENGTH} caratteri.
        </span>
      </div>

      <label class="consenso">
        <input
          type="checkbox"
          checked={consenso}
          onChange={(e) => setConsenso((e.target as HTMLInputElement).checked)}
          required
        />
        <span>
          Ho letto l’
          <a href="/pagina/privacy-policy" target="_blank" rel="noopener">
            informativa sulla privacy
          </a>{' '}
          e accetto che i miei commenti, una volta approvati, siano pubblicati con il nome scelto.
        </span>
      </label>

      <div class="modulo__azioni">
        <button type="submit" class="bottone" disabled={invio || !completo}>
          {invio ? 'Invio…' : 'Crea l’account'}
        </button>
        <span class="modulo__link">
          Hai già un account?{' '}
          <a
            href={`/accedi${ritorno === '/profilo' ? '' : `?ritorno=${encodeURIComponent(ritorno)}`}`}
          >
            Accedi
          </a>
        </span>
      </div>
    </form>
  )
}
