import { useEffect, useMemo, useState } from 'preact/hooks'
import { PASSWORD_MIN_LENGTH } from '@esperia/shared'
import { getSupabase } from '@/lib/supabase'
import { messaggioErrore } from '@/lib/account'

/**
 * Scelta della nuova password, dal link ricevuto per email — RF-C-01.
 *
 * Il link porta i token nell'indirizzo; il client Supabase li riconosce
 * all'avvio (`detectSessionInUrl`) e apre una sessione di recupero. Se la
 * sessione non c'e', il link era scaduto o gia' usato: lo diciamo invece di
 * mostrare un modulo che fallirebbe all'invio.
 */
export default function NuovaPassword() {
  const supabase = useMemo(() => getSupabase(), [])

  const [stato, setStato] = useState<'verifica' | 'pronto' | 'scaduto' | 'fatto'>('verifica')
  const [password, setPassword] = useState('')
  const [conferma, setConferma] = useState('')
  const [invio, setInvio] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => {
      setStato(data.session ? 'pronto' : 'scaduto')
    })
  }, [supabase])

  if (!supabase) {
    return <p class="riquadro">Il recupero della password non è al momento disponibile.</p>
  }

  if (stato === 'verifica') return <p class="riquadro">Verifica del link…</p>

  if (stato === 'scaduto') {
    return (
      <div class="modulo">
        <p class="riquadro riquadro--attenzione" role="alert">
          Il link è scaduto o è già stato usato.
        </p>
        <p class="modulo__link">
          <a href="/recupera-password">Richiedi un nuovo link</a>
        </p>
      </div>
    )
  }

  if (stato === 'fatto') {
    return (
      <div class="modulo">
        <p class="riquadro riquadro--ok" role="status">
          Password aggiornata. Da ora accedi con quella nuova.
        </p>
        <p class="modulo__azioni">
          <a class="bottone" href="/profilo">
            Vai al profilo
          </a>
        </p>
      </div>
    )
  }

  const coincidono = password === conferma
  const valida = password.length >= PASSWORD_MIN_LENGTH && coincidono

  async function salva(e: Event) {
    e.preventDefault()
    if (!supabase || !valida) return
    setInvio(true)
    setErrore(null)

    const { error } = await supabase.auth.updateUser({ password })

    setInvio(false)
    if (error) {
      setErrore(messaggioErrore(error))
      return
    }
    setStato('fatto')
  }

  return (
    <form class="modulo" onSubmit={salva} noValidate>
      {errore && (
        <p class="riquadro riquadro--errore" role="alert">
          {errore}
        </p>
      )}

      <div class="campo">
        <label class="campo__etichetta" for="nuova-password">
          Nuova password
        </label>
        <input
          id="nuova-password"
          type="password"
          autocomplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          value={password}
          onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
          aria-describedby="nuova-password-aiuto"
        />
        <span class="campo__aiuto" id="nuova-password-aiuto">
          Almeno {PASSWORD_MIN_LENGTH} caratteri.
        </span>
      </div>

      <div class="campo">
        <label class="campo__etichetta" for="conferma-password">
          Ripeti la password
        </label>
        <input
          id="conferma-password"
          type="password"
          autocomplete="new-password"
          required
          value={conferma}
          onInput={(e) => setConferma((e.target as HTMLInputElement).value)}
          aria-invalid={conferma.length > 0 && !coincidono}
        />
        {conferma.length > 0 && !coincidono && (
          <span class="campo__aiuto">Le due password non coincidono.</span>
        )}
      </div>

      <div class="modulo__azioni">
        <button type="submit" class="bottone" disabled={invio || !valida}>
          {invio ? 'Salvataggio…' : 'Salva la nuova password'}
        </button>
      </div>
    </form>
  )
}
