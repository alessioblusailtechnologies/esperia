import { useEffect, useMemo, useState } from 'preact/hooks'
import type { User } from '@supabase/supabase-js'
import {
  BIO_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@esperia/shared'
import { getSupabase } from '@/lib/supabase'
import { messaggioErrore } from '@/lib/account'

/**
 * Profilo dell'utente della community — RF-C-02, RF-C-07.
 *
 * Quattro blocchi: dati pubblici (nome e biografia), password, uscita,
 * cancellazione dell'account. Il distintivo "Redazione" e il blocco non sono
 * modificabili da qui, e non per scelta dell'interfaccia: un trigger nel
 * database rifiuta la modifica di quei campi a chiunque non sia la moderazione.
 */

interface RigaProfilo {
  display_name: string
  bio: string | null
  avatar_url: string | null
  created_at: string
  banned_at: string | null
  deletion_requested_at: string | null
}

type Esito = { tipo: 'ok' | 'errore'; testo: string } | null

const data = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })

function iniziali(nome: string): string {
  return nome
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

function RiquadroEsito({ esito }: { esito: Esito }) {
  if (!esito) return null
  return (
    <p
      class={`riquadro riquadro--${esito.tipo === 'ok' ? 'ok' : 'errore'}`}
      role={esito.tipo === 'ok' ? 'status' : 'alert'}
    >
      {esito.testo}
    </p>
  )
}

export default function Profilo() {
  const supabase = useMemo(() => getSupabase(), [])

  const [utente, setUtente] = useState<User | null>(null)
  const [profilo, setProfilo] = useState<RigaProfilo | null>(null)
  const [caricamento, setCaricamento] = useState(true)
  const [erroreCaricamento, setErroreCaricamento] = useState<string | null>(null)

  const [nome, setNome] = useState('')
  const [bio, setBio] = useState('')
  const [salvaDati, setSalvaDati] = useState(false)
  const [esitoDati, setEsitoDati] = useState<Esito>(null)

  const [password, setPassword] = useState('')
  const [salvaPassword, setSalvaPassword] = useState(false)
  const [esitoPassword, setEsitoPassword] = useState<Esito>(null)

  const [confermaCancellazione, setConfermaCancellazione] = useState(false)
  const [cancellazione, setCancellazione] = useState(false)
  const [esitoCancellazione, setEsitoCancellazione] = useState<Esito>(null)
  const [cancellazioneRichiesta, setCancellazioneRichiesta] = useState(false)

  useEffect(() => {
    if (!supabase) {
      setCaricamento(false)
      return
    }

    void (async () => {
      const { data: sessione } = await supabase.auth.getUser()
      if (!sessione.user) {
        window.location.replace(`/accedi?ritorno=${encodeURIComponent('/profilo')}`)
        return
      }
      setUtente(sessione.user)

      const { data: riga, error } = await supabase
        .from('profiles')
        .select('display_name, bio, avatar_url, created_at, banned_at, deletion_requested_at')
        .eq('id', sessione.user.id)
        .maybeSingle()

      if (error || !riga) {
        setErroreCaricamento('Non è stato possibile caricare il profilo. Riprova fra poco.')
        setCaricamento(false)
        return
      }

      const p = riga as RigaProfilo
      setProfilo(p)
      setNome(p.display_name)
      setBio(p.bio ?? '')
      setCaricamento(false)
    })()
  }, [supabase])

  if (!supabase) {
    return <p class="riquadro">L’area riservata non è al momento disponibile.</p>
  }
  if (caricamento) return <p class="riquadro">Caricamento del profilo…</p>
  if (erroreCaricamento || !profilo || !utente) {
    return (
      <p class="riquadro riquadro--errore" role="alert">
        {erroreCaricamento ?? 'Profilo non disponibile.'}
      </p>
    )
  }

  /* --- Cancellazione gia' richiesta: il resto non serve piu' ---------------- */

  if (profilo.deletion_requested_at || cancellazioneRichiesta) {
    return (
      <div class="modulo">
        <p class="riquadro riquadro--attenzione" role="status">
          La cancellazione dell’account è stata richiesta
          {profilo.deletion_requested_at
            ? ` il ${data.format(new Date(profilo.deletion_requested_at))}`
            : ''}{' '}
          e verrà completata entro 24 ore. Non serve fare altro.
        </p>
        <p class="modulo__testo">
          Per ripensamenti o domande scrivi alla redazione dalla pagina{' '}
          <a href="/pagina/contatti">Contatti</a> prima che la cancellazione sia eseguita.
        </p>
      </div>
    )
  }

  /* --- Azioni ------------------------------------------------------------- */

  const nomePulito = nome.trim()
  const nomeValido =
    nomePulito.length >= DISPLAY_NAME_MIN_LENGTH && nomePulito.length <= DISPLAY_NAME_MAX_LENGTH
  const datiCambiati = nomePulito !== profilo.display_name || bio.trim() !== (profilo.bio ?? '')

  async function salvaProfilo(e: Event) {
    e.preventDefault()
    if (!supabase || !utente || !nomeValido) return
    setSalvaDati(true)
    setEsitoDati(null)

    const nuovaBio = bio.trim() || null
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: nomePulito, bio: nuovaBio })
      .eq('id', utente.id)

    setSalvaDati(false)
    if (error) {
      setEsitoDati({ tipo: 'errore', testo: 'Salvataggio non riuscito. Riprova fra poco.' })
      return
    }
    setProfilo({ ...profilo!, display_name: nomePulito, bio: nuovaBio })
    setEsitoDati({ tipo: 'ok', testo: 'Profilo aggiornato.' })
  }

  async function cambiaPassword(e: Event) {
    e.preventDefault()
    if (!supabase || password.length < PASSWORD_MIN_LENGTH) return
    setSalvaPassword(true)
    setEsitoPassword(null)

    const { error } = await supabase.auth.updateUser({ password })

    setSalvaPassword(false)
    if (error) {
      setEsitoPassword({ tipo: 'errore', testo: messaggioErrore(error) })
      return
    }
    setPassword('')
    setEsitoPassword({ tipo: 'ok', testo: 'Password aggiornata.' })
  }

  async function esci() {
    await supabase?.auth.signOut()
    window.location.assign('/')
  }

  async function richiediCancellazione(e: Event) {
    e.preventDefault()
    if (!supabase || !confermaCancellazione) return
    setCancellazione(true)
    setEsitoCancellazione(null)

    const { error } = await supabase.rpc('request_account_deletion')

    if (error) {
      setCancellazione(false)
      setEsitoCancellazione({
        tipo: 'errore',
        testo: 'Richiesta non riuscita. Riprova fra poco o scrivi alla redazione.',
      })
      return
    }

    // La sessione si chiude: da qui l'account non deve piu' poter scrivere.
    await supabase.auth.signOut()
    setCancellazioneRichiesta(true)
  }

  return (
    <>
      <div class="profilo__intestazione">
        {profilo.avatar_url ? (
          <img class="avatar profilo__avatar" src={profilo.avatar_url} alt="" />
        ) : (
          <span class="avatar profilo__avatar profilo__avatar--iniziali" aria-hidden="true">
            {iniziali(profilo.display_name)}
          </span>
        )}
        <div>
          <p class="profilo__nome">{profilo.display_name}</p>
          <p class="profilo__meta">Iscritto dal {data.format(new Date(profilo.created_at))}</p>
        </div>
      </div>

      {profilo.banned_at && (
        <p class="riquadro riquadro--attenzione profilo__avviso" role="status">
          La redazione ha sospeso la possibilità di commentare per questo account. Puoi continuare a
          leggere e gestire i tuoi dati.
        </p>
      )}

      {/* --- Dati pubblici ------------------------------------------------ */}
      <form class="modulo" onSubmit={salvaProfilo} noValidate>
        <h2 class="modulo__titolo">Dati del profilo</h2>
        <RiquadroEsito esito={esitoDati} />

        <div class="campo">
          <label class="campo__etichetta" for="profilo-nome">
            Nome pubblico
          </label>
          <input
            id="profilo-nome"
            type="text"
            autocomplete="nickname"
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            value={nome}
            onInput={(e) => setNome((e.target as HTMLInputElement).value)}
            aria-describedby="profilo-nome-aiuto"
          />
          <span class="campo__aiuto" id="profilo-nome-aiuto">
            Compare accanto ai tuoi commenti, da {DISPLAY_NAME_MIN_LENGTH} a{' '}
            {DISPLAY_NAME_MAX_LENGTH} caratteri.
          </span>
        </div>

        <div class="campo">
          <label class="campo__etichetta" for="profilo-bio">
            Biografia <span class="campo__aiuto">(facoltativa)</span>
          </label>
          <textarea
            id="profilo-bio"
            maxLength={BIO_MAX_LENGTH}
            value={bio}
            onInput={(e) => setBio((e.target as HTMLTextAreaElement).value)}
          />
          <span class="campo__aiuto">{BIO_MAX_LENGTH - bio.length} caratteri disponibili</span>
        </div>

        <div class="campo">
          <label class="campo__etichetta" for="profilo-email">
            Email
          </label>
          <input id="profilo-email" type="email" value={utente.email ?? ''} readOnly />
          <span class="campo__aiuto">Usata solo per l’accesso, non viene mai mostrata.</span>
        </div>

        <div class="modulo__azioni">
          <button
            type="submit"
            class="bottone"
            disabled={salvaDati || !nomeValido || !datiCambiati}
          >
            {salvaDati ? 'Salvataggio…' : 'Salva le modifiche'}
          </button>
        </div>
      </form>

      {/* --- Password ----------------------------------------------------- */}
      <form class="modulo" onSubmit={cambiaPassword} noValidate>
        <h2 class="modulo__titolo">Password</h2>
        <RiquadroEsito esito={esitoPassword} />

        <div class="campo">
          <label class="campo__etichetta" for="profilo-password">
            Nuova password
          </label>
          <input
            id="profilo-password"
            type="password"
            autocomplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            value={password}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
            aria-describedby="profilo-password-aiuto"
          />
          <span class="campo__aiuto" id="profilo-password-aiuto">
            Almeno {PASSWORD_MIN_LENGTH} caratteri.
          </span>
        </div>

        <div class="modulo__azioni">
          <button
            type="submit"
            class="bottone"
            disabled={salvaPassword || password.length < PASSWORD_MIN_LENGTH}
          >
            {salvaPassword ? 'Salvataggio…' : 'Cambia la password'}
          </button>
        </div>
      </form>

      {/* --- Uscita ------------------------------------------------------- */}
      <div class="modulo">
        <h2 class="modulo__titolo">Sessione</h2>
        <div class="modulo__azioni">
          <button type="button" class="bottone bottone--secondario" onClick={esci}>
            Esci
          </button>
        </div>
      </div>

      {/* --- Cancellazione — RF-C-07 -------------------------------------- */}
      <form class="modulo" onSubmit={richiediCancellazione}>
        <h2 class="modulo__titolo">Cancella l’account</h2>
        <RiquadroEsito esito={esitoCancellazione} />

        <p class="modulo__testo">
          Vengono eliminati email, password, profilo e reazioni. I commenti già pubblicati restano
          nelle discussioni, perché toglierli spezzerebbe le risposte degli altri lettori, ma
          compaiono come scritti da un <strong>utente rimosso</strong> e non sono più riconducibili
          a te. La cancellazione è definitiva e viene completata entro 24 ore.
        </p>

        <label class="consenso">
          <input
            type="checkbox"
            checked={confermaCancellazione}
            onChange={(e) => setConfermaCancellazione((e.target as HTMLInputElement).checked)}
          />
          <span>Ho capito che l’operazione non si può annullare.</span>
        </label>

        <div class="modulo__azioni">
          <button
            type="submit"
            class="bottone bottone--pericolo"
            disabled={cancellazione || !confermaCancellazione}
          >
            {cancellazione ? 'Invio…' : 'Cancella il mio account'}
          </button>
        </div>
      </form>

      <style>{stili}</style>
    </>
  )
}

const stili = `
  .profilo__intestazione {
    display: flex; gap: var(--spazio-4); align-items: center;
    margin-top: var(--spazio-7);
  }
  .profilo__avatar { width: 56px; height: 56px; flex: 0 0 56px; object-fit: cover; }
  .profilo__avatar--iniziali {
    background: var(--colore-inverso); color: var(--colore-testo-inverso);
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; font-weight: var(--peso-forte);
  }
  .profilo__nome { font-family: var(--font-titoli); font-size: 22px; font-weight: var(--peso-forte); }
  .profilo__meta { font-size: var(--testo-xs); color: var(--colore-testo-meta); margin-top: 2px; }
  .profilo__avviso { margin-top: var(--spazio-6); }
`
