import { useCallback, useEffect, useMemo, useState } from 'preact/hooks'
import type { User } from '@supabase/supabase-js'
import { getSupabase, type CommentoConAutore } from '@/lib/supabase'
import {
  COMMENT_MAX_LENGTH,
  COMMENT_MIN_LENGTH,
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  type ReportReason,
} from '@esperia/shared'

/**
 * Discussione sotto l'articolo — RF-C-03, RF-C-04, RF-C-05.
 * Impaginazione dai design (Articolo v1, blocco Commenti e pannello Segnalazione).
 *
 * L'isola parla direttamente con Supabase: chi può leggere e scrivere lo
 * stabiliscono le policy RLS, non questo componente. Qui gestiamo solo
 * l'interfaccia e i messaggi all'utente.
 */

interface Props {
  articleId: string
  articleSlug: string
}

const relativo = new Intl.RelativeTimeFormat('it-IT', { numeric: 'auto' })
const dataAssoluta = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function quando(iso: string): string {
  const minuti = Math.round((new Date(iso).getTime() - Date.now()) / 60000)
  if (Math.abs(minuti) < 60) return relativo.format(minuti, 'minute')
  const ore = Math.round(minuti / 60)
  if (Math.abs(ore) < 24) return relativo.format(ore, 'hour')
  const giorni = Math.round(ore / 24)
  if (Math.abs(giorni) <= 7) return relativo.format(giorni, 'day')
  return dataAssoluta.format(new Date(iso))
}

function iniziali(nome: string): string {
  return nome
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export default function CommentsSection({ articleId, articleSlug }: Props) {
  const supabase = useMemo(() => getSupabase(), [])

  const [utente, setUtente] = useState<User | null>(null)
  const [nomeUtente, setNomeUtente] = useState<string>('')
  const [commenti, setCommenti] = useState<CommentoConAutore[]>([])
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)
  const [conferma, setConferma] = useState<string | null>(null)

  const [testo, setTesto] = useState('')
  const [rispondiA, setRispondiA] = useState<string | null>(null)
  const [invio, setInvio] = useState(false)

  const [segnala, setSegnala] = useState<CommentoConAutore | null>(null)
  const [motivo, setMotivo] = useState<ReportReason | null>(null)
  const [segnalazioneInviata, setSegnalazioneInviata] = useState(false)

  /* ---------------------------------------------------------------------- */

  const carica = useCallback(async () => {
    if (!supabase) {
      setCaricamento(false)
      return
    }
    setCaricamento(true)

    const { data, error } = await supabase
      .from('comments')
      .select(
        'id, article_id, author_id, parent_id, body, status, created_at, edited_at, profiles(display_name, avatar_url, is_staff)',
      )
      .eq('article_id', articleId)
      .order('created_at', { ascending: true })

    if (error) {
      setErrore('Non è stato possibile caricare i commenti.')
      console.error('[commenti]', error.message)
      setCaricamento(false)
      return
    }

    const righe = (data ?? []) as unknown as CommentoConAutore[]

    // Reazioni "mi piace" dei commenti in pagina, in una sola query.
    if (righe.length > 0) {
      const { data: reazioni } = await supabase
        .from('reactions')
        .select('target_id, user_id')
        .eq('target_type', 'comment')
        .eq('type', 'mi_piace')
        .in(
          'target_id',
          righe.map((c) => c.id),
        )

      const conteggi = new Map<string, number>()
      const miei = new Set<string>()
      for (const r of reazioni ?? []) {
        const id = String((r as { target_id: string }).target_id)
        conteggi.set(id, (conteggi.get(id) ?? 0) + 1)
        if ((r as { user_id: string }).user_id === utente?.id) miei.add(id)
      }
      for (const c of righe) {
        c.mi_piace = conteggi.get(c.id) ?? 0
        c.mio_mi_piace = miei.has(c.id)
      }
    }

    setCommenti(righe)
    setErrore(null)
    setCaricamento(false)
  }, [supabase, articleId, utente?.id])

  useEffect(() => {
    if (!supabase) {
      setCaricamento(false)
      return
    }
    supabase.auth.getUser().then(async ({ data }) => {
      setUtente(data.user ?? null)
      if (data.user) {
        const { data: profilo } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', data.user.id)
          .maybeSingle()
        setNomeUtente((profilo as { display_name?: string } | null)?.display_name ?? '')
      }
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setUtente(session?.user ?? null),
    )
    return () => sub.subscription.unsubscribe()
  }, [supabase])

  useEffect(() => {
    void carica()
  }, [carica])

  /* ---------------------------------------------------------------------- */

  const radici = useMemo(() => commenti.filter((c) => c.parent_id === null), [commenti])
  const risposteDi = useCallback(
    (id: string) => commenti.filter((c) => c.parent_id === id),
    [commenti],
  )

  async function invia(e: Event) {
    e.preventDefault()
    if (!supabase || !utente) return

    const corpo = testo.trim()
    if (corpo.length < COMMENT_MIN_LENGTH) {
      setErrore('Il commento è troppo breve.')
      return
    }

    setInvio(true)
    setErrore(null)

    const { error } = await supabase.from('comments').insert({
      article_id: articleId,
      author_id: utente.id,
      parent_id: rispondiA,
      body: corpo,
      status: 'in_attesa',
    })

    setInvio(false)

    if (error) {
      // Il messaggio del database sarebbe incomprensibile per un lettore.
      setErrore(
        error.code === '42501' || error.message.includes('is_banned')
          ? 'Non è possibile pubblicare commenti con questo account.'
          : 'Invio non riuscito. Riprova fra poco.',
      )
      return
    }

    setTesto('')
    setRispondiA(null)
    setConferma('Grazie. Il commento sarà visibile dopo la revisione della redazione.')
    void carica()
  }

  async function miPiace(c: CommentoConAutore) {
    if (!supabase || !utente) return

    if (c.mio_mi_piace) {
      await supabase
        .from('reactions')
        .delete()
        .eq('target_type', 'comment')
        .eq('target_id', c.id)
        .eq('user_id', utente.id)
    } else {
      await supabase.from('reactions').insert({
        target_type: 'comment',
        target_id: c.id,
        user_id: utente.id,
        type: 'mi_piace',
      })
    }

    // Aggiornamento ottimistico: la reazione deve sembrare istantanea.
    setCommenti((prev) =>
      prev.map((x) =>
        x.id === c.id
          ? { ...x, mio_mi_piace: !c.mio_mi_piace, mi_piace: (x.mi_piace ?? 0) + (c.mio_mi_piace ? -1 : 1) }
          : x,
      ),
    )
  }

  async function inviaSegnalazione() {
    if (!supabase || !utente || !segnala || !motivo) return

    const { error } = await supabase
      .from('reports')
      .insert({ comment_id: segnala.id, reporter_id: utente.id, reason: motivo, status: 'aperta' })

    // 23505 = segnalazione già inviata da questo utente: per lui è comunque un successo.
    if (error && error.code !== '23505') {
      setErrore('Segnalazione non riuscita. Riprova fra poco.')
      setSegnala(null)
      return
    }
    setSegnalazioneInviata(true)
  }

  function chiudiSegnalazione() {
    setSegnala(null)
    setMotivo(null)
    setSegnalazioneInviata(false)
  }

  /* ---------------------------------------------------------------------- */

  if (!supabase) {
    return (
      <>
        <p class="riquadro">I commenti non sono al momento disponibili.</p>
        <style>{stili}</style>
      </>
    )
  }

  const ritorno = encodeURIComponent(`/${articleSlug}`)

  function Commento({ c, risposta }: { c: CommentoConAutore; risposta?: boolean }) {
    const mio = utente?.id === c.author_id
    return (
      <article class={`commento${risposta ? ' commento--risposta' : ''}`}>
        {c.profiles?.avatar_url ? (
          <img class="avatar commento__avatar" src={c.profiles.avatar_url} alt="" />
        ) : (
          <span class="avatar commento__avatar" aria-hidden="true" />
        )}

        <div class="commento__corpo">
          <div class="commento__testata">
            <span class="commento__autore">{c.profiles?.display_name ?? 'Utente rimosso'}</span>
            {c.profiles?.is_staff && <span class="commento__distintivo">Redazione</span>}
            <time class="commento__quando" datetime={c.created_at}>{quando(c.created_at)}</time>
            {c.status === 'in_attesa' && mio && (
              <span class="commento__stato">In attesa di revisione</span>
            )}
          </div>

          <p class="commento__testo">{c.body}</p>

          <div class="commento__azioni">
            {utente ? (
              <button
                type="button"
                class={`commento__azione${c.mio_mi_piace ? ' commento__azione--attiva' : ''}`}
                onClick={() => miPiace(c)}
                aria-pressed={Boolean(c.mio_mi_piace)}
              >
                Mi piace{c.mi_piace ? ` · ${c.mi_piace}` : ''}
              </button>
            ) : (
              <span class="commento__azione commento__azione--spenta">
                Mi piace{c.mi_piace ? ` · ${c.mi_piace}` : ''}
              </span>
            )}

            {utente && !risposta && (
              <button type="button" class="commento__azione" onClick={() => setRispondiA(c.id)}>
                Rispondi
              </button>
            )}

            {utente && !mio && (
              <button
                type="button"
                class="commento__azione commento__azione--segnala"
                onClick={() => setSegnala(c)}
              >
                Segnala
              </button>
            )}
          </div>
        </div>
      </article>
    )
  }

  return (
    <div class="commenti">
      {conferma && <p class="riquadro riquadro--ok" role="status">{conferma}</p>}
      {errore && <p class="riquadro riquadro--errore" role="alert">{errore}</p>}

      {utente ? (
        <form class="scrivi" onSubmit={invia}>
          <span class="avatar scrivi__avatar" aria-hidden="true">
            {nomeUtente ? iniziali(nomeUtente) : ''}
          </span>

          <div class="scrivi__campo">
            {rispondiA && (
              <p class="scrivi__risposta">
                Stai rispondendo a un commento.{' '}
                <button type="button" onClick={() => setRispondiA(null)}>Annulla</button>
              </p>
            )}

            <label class="solo-lettori-schermo" for="nuovo-commento">Scrivi un commento</label>
            <textarea
              id="nuovo-commento"
              value={testo}
              maxLength={COMMENT_MAX_LENGTH}
              placeholder="Scrivi un commento — resta nel merito dell’articolo"
              onInput={(e) => setTesto((e.target as HTMLTextAreaElement).value)}
            />

            <div class="scrivi__coda">
              <span class="scrivi__nota">
                {nomeUtente && (
                  <>Commenti come <strong>{nomeUtente}</strong> · </>
                )}
                {COMMENT_MAX_LENGTH - testo.length} caratteri disponibili
              </span>
              <button
                type="submit"
                class="scrivi__invia"
                disabled={invio || testo.trim().length < COMMENT_MIN_LENGTH}
              >
                {invio ? 'Invio…' : 'Pubblica'}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div class="ospite">
          <p class="ospite__testo">
            Per partecipare alla discussione accedi al tuo profilo, oppure registrati:
            i commenti restano leggibili a tutti.
          </p>
          <p class="ospite__azioni">
            <a href={`/accedi?ritorno=${ritorno}`} class="ospite__accedi">Accedi</a>
            <span aria-hidden="true">/</span>
            <a href={`/registrati?ritorno=${ritorno}`} class="ospite__registrati">Registrati</a>
          </p>
        </div>
      )}

      {caricamento ? (
        <p class="riquadro">Caricamento dei commenti…</p>
      ) : radici.length === 0 ? (
        <p class="riquadro">Nessun commento. Puoi essere il primo.</p>
      ) : (
        <div class="elenco">
          {radici.map((c) => (
            <>
              <Commento c={c} />
              {risposteDi(c.id).map((r) => <Commento c={r} risposta />)}
            </>
          ))}
        </div>
      )}

      {/* ---------- Pannello di segnalazione ---------- */}
      {segnala && (
        <div class="velo" onClick={(e) => e.target === e.currentTarget && chiudiSegnalazione()}>
          <div class="segnalazione" role="dialog" aria-modal="true" aria-labelledby="seg-titolo">
            {segnalazioneInviata ? (
              <>
                <h3 id="seg-titolo" class="segnalazione__titolo">Segnalazione inviata</h3>
                <p class="segnalazione__sotto">
                  La redazione esamina le segnalazioni e decide se rimuovere il commento.
                </p>
                <button type="button" class="segnalazione__conferma" onClick={chiudiSegnalazione}>
                  Chiudi
                </button>
              </>
            ) : (
              <>
                <h3 id="seg-titolo" class="segnalazione__titolo">Segnala il commento</h3>
                <p class="segnalazione__sotto">
                  Commento di{' '}
                  <strong>{segnala.profiles?.display_name ?? 'utente rimosso'}</strong> ·
                  seleziona una motivazione.
                </p>

                <fieldset class="segnalazione__motivi">
                  <legend class="solo-lettori-schermo">Motivo della segnalazione</legend>
                  {REPORT_REASONS.map((r) => (
                    <label class="segnalazione__motivo">
                      <input
                        type="radio"
                        name="motivo"
                        value={r}
                        checked={motivo === r}
                        onChange={() => setMotivo(r)}
                      />
                      <span>{REPORT_REASON_LABELS[r]}</span>
                    </label>
                  ))}
                </fieldset>

                <div class="segnalazione__azioni">
                  <button type="button" class="segnalazione__annulla" onClick={chiudiSegnalazione}>
                    Annulla
                  </button>
                  <button
                    type="button"
                    class="segnalazione__conferma"
                    disabled={!motivo}
                    onClick={inviaSegnalazione}
                  >
                    Invia segnalazione
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style>{stili}</style>
    </div>
  )
}

const stili = `
  .commenti { padding-bottom: var(--spazio-8); }

  .riquadro {
    font-size: var(--testo-base);
    color: var(--colore-testo-tenue);
    padding: 18px 20px;
    background: var(--colore-superficie);
    border-radius: var(--raggio-md);
    margin-bottom: var(--spazio-3);
  }
  .riquadro--ok { border-left: 3px solid var(--colore-successo); }
  .riquadro--errore { border-left: 3px solid var(--colore-errore); }

  /* --- Composizione ------------------------------------------------------ */

  .scrivi { display: flex; gap: 12px; align-items: flex-start; padding-bottom: 8px; }
  .scrivi__avatar {
    width: 38px; height: 38px; flex: 0 0 38px;
    background: var(--colore-inverso);
    color: var(--colore-testo-inverso);
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: var(--peso-forte);
  }
  .scrivi__campo {
    flex: 1;
    display: flex; flex-direction: column; gap: 10px;
    border: 1px solid var(--colore-bordo-medio);
    border-radius: var(--raggio-md);
    padding: 14px 16px;
    background: var(--colore-superficie-chiara);
  }
  .scrivi__campo:focus-within { border-color: var(--colore-testo-meta); }
  .scrivi__campo textarea {
    border: none; outline: none; resize: vertical; background: none;
    font-family: var(--font-testo);
    font-size: var(--testo-base);
    line-height: 1.6;
    color: var(--colore-testo);
    min-height: 64px; width: 100%;
  }
  .scrivi__risposta { font-size: var(--testo-xs); color: var(--colore-testo-meta); }
  .scrivi__risposta button {
    background: none; border: 0; padding: 0; font: inherit;
    color: var(--colore-accento); cursor: pointer; text-decoration: underline;
  }
  .scrivi__coda {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    border-top: 1px solid var(--colore-superficie);
    padding-top: 11px;
  }
  .scrivi__nota {
    font-size: var(--testo-xs); color: var(--colore-testo-meta);
    flex: 1; min-width: 150px;
  }
  .scrivi__nota strong { color: var(--colore-testo); font-weight: var(--peso-forte); }
  .scrivi__invia {
    font: inherit; font-size: var(--testo-sm); font-weight: var(--peso-forte);
    background: var(--colore-inverso); color: var(--colore-testo-inverso);
    border: 0; border-radius: var(--raggio-pill);
    padding: 9px 20px; cursor: pointer;
  }
  .scrivi__invia:hover:not(:disabled) { background: var(--colore-inverso-hover); }
  .scrivi__invia:disabled { opacity: .45; cursor: not-allowed; }

  /* --- Ospite ------------------------------------------------------------- */

  .ospite {
    display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
    border: 1px solid var(--colore-bordo);
    border-radius: var(--raggio-md);
    padding: 20px 22px;
    margin-bottom: 8px;
  }
  .ospite__testo {
    flex: 1; min-width: 220px;
    font-size: var(--testo-base); line-height: 1.55;
    color: var(--colore-testo-tenue);
  }
  .ospite__azioni {
    display: flex; align-items: center; gap: 10px;
    font-size: 13px; font-weight: var(--peso-forte);
  }
  .ospite__azioni span { color: var(--colore-bordo-forte); }
  .ospite__accedi { color: var(--colore-accento); }
  .ospite__registrati {
    text-decoration: underline; text-underline-offset: 3px;
    text-decoration-color: var(--colore-bordo-forte);
  }

  /* --- Elenco ------------------------------------------------------------- */

  .elenco { display: flex; flex-direction: column; }

  .commento {
    display: flex; gap: 12px; align-items: flex-start;
    padding: 20px 0;
    border-top: 1px solid var(--colore-bordo);
  }
  .commento--risposta {
    padding: 20px 0 20px clamp(16px, 4vw, 48px);
    border-left: 2px solid var(--colore-bordo);
    margin-left: clamp(12px, 3vw, 26px);
  }
  .commento__avatar { width: 36px; height: 36px; flex: 0 0 36px; }
  .commento--risposta .commento__avatar { width: 30px; height: 30px; flex: 0 0 30px; }

  .commento__corpo { flex: 1; display: flex; flex-direction: column; gap: 7px; }
  .commento__testata { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .commento__autore { font-size: 13px; font-weight: var(--peso-forte); }
  .commento--risposta .commento__autore { font-size: var(--testo-sm); }
  .commento__distintivo {
    font-size: 10px; font-weight: var(--peso-forte); letter-spacing: 1px;
    text-transform: uppercase;
    background: var(--colore-superficie); color: var(--colore-testo-tenue);
    border-radius: 4px; padding: 2px 6px;
  }
  .commento__quando { font-size: var(--testo-xs); color: var(--colore-testo-meta); }
  .commento__stato {
    font-size: var(--testo-xs); color: var(--colore-attenzione);
  }
  .commento__testo {
    font-size: var(--testo-base); line-height: 1.62;
    color: var(--colore-testo-corpo);
    white-space: pre-wrap;
  }
  .commento__azioni { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
  .commento__azione {
    font: inherit; font-size: var(--testo-xs);
    background: none; border: 0; padding: 0;
    color: var(--colore-testo-meta); cursor: pointer;
  }
  .commento__azione:hover { color: var(--colore-testo); }
  .commento__azione--attiva { color: var(--colore-accento); font-weight: var(--peso-medio); }
  .commento__azione--segnala:hover { color: var(--colore-accento); }
  .commento__azione--spenta { cursor: default; }

  /* --- Segnalazione -------------------------------------------------------- */

  .velo {
    position: fixed; inset: 0;
    background: var(--velo-modale);
    display: flex; align-items: center; justify-content: center;
    padding: clamp(12px, 2vw, 24px);
    z-index: 60;
  }
  .segnalazione {
    width: 100%; max-width: 520px;
    background: var(--colore-fondo);
    border-radius: var(--raggio-lg);
    padding: clamp(20px, 2.4vw, 28px);
    display: flex; flex-direction: column; gap: var(--spazio-5);
    box-shadow: var(--ombra-modale);
    max-height: 90vh; overflow: auto;
  }
  .segnalazione__titolo {
    font-family: var(--font-titoli); font-size: 24px; font-weight: var(--peso-forte);
  }
  .segnalazione__sotto {
    font-size: var(--testo-sm); color: var(--colore-testo-meta); line-height: 1.5;
  }
  .segnalazione__sotto strong { color: var(--colore-testo); font-weight: var(--peso-forte); }
  .segnalazione__motivi { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .segnalazione__motivo {
    display: flex; align-items: center; gap: 12px;
    padding: 13px 0;
    border-top: 1px solid var(--colore-bordo);
    font-size: var(--testo-base);
    cursor: pointer;
  }
  .segnalazione__motivo:last-child { border-bottom: 1px solid var(--colore-bordo); }
  .segnalazione__motivo input { accent-color: var(--colore-accento); }
  .segnalazione__azioni { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
  .segnalazione__annulla {
    font: inherit; font-size: 13px; font-weight: var(--peso-forte);
    background: none; border: 1px solid var(--colore-bordo-forte);
    border-radius: var(--raggio-pill); padding: 11px 22px; cursor: pointer;
    color: var(--colore-testo);
  }
  .segnalazione__conferma {
    font: inherit; font-size: 13px; font-weight: var(--peso-forte);
    background: var(--colore-inverso); color: var(--colore-testo-inverso);
    border: 0; border-radius: var(--raggio-pill); padding: 11px 22px; cursor: pointer;
  }
  .segnalazione__conferma:hover:not(:disabled) { background: var(--colore-inverso-hover); }
  .segnalazione__conferma:disabled { opacity: .45; cursor: not-allowed; }
`
