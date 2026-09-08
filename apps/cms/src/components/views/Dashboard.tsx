import Link from 'next/link'
import type { AdminViewServerProps } from 'payload'
import { roleAtLeast, statoVisibile, type StaffRole } from '@esperia/shared'

import { PastigliaStato } from '../PastigliaStato'
import { contaModerazione } from '@/lib/supabase'

import './Dashboard.scss'

/**
 * Dashboard redazionale — RF-B-12, impaginazione dai design (Dashboard v1).
 *
 * Sostituisce la dashboard predefinita di Payload, che elenca le collection.
 * Qui la domanda a cui si risponde è un'altra: *cosa devo fare adesso*. Ogni
 * blocco è una coda di lavoro, e ogni riga porta direttamente al documento.
 *
 * I blocchi visibili dipendono dal ruolo: un redattore non ha nulla da fare
 * con la coda di revisione altrui, un editor sì.
 */

const formatta = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' })
const formattaOra = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' })
const relativo = new Intl.RelativeTimeFormat('it-IT', { numeric: 'auto' })

function eta(iso: string | null | undefined): string {
  if (!iso) return ''
  const ore = Math.round((new Date(iso).getTime() - Date.now()) / 3_600_000)
  if (Math.abs(ore) < 24) return relativo.format(ore, 'hour')
  return relativo.format(Math.round(ore / 24), 'day')
}

function saluto(): string {
  const h = new Date().getHours()
  if (h < 13) return 'Buongiorno'
  if (h < 18) return 'Buon pomeriggio'
  return 'Buonasera'
}

type Articolo = {
  id: string
  title: string
  slug?: string | null
  _status?: string | null
  editorialStatus?: string | null
  publishedAt?: string | null
  updatedAt?: string
  category?: { name?: string } | string | null
  authors?: Array<{ name?: string } | string> | null
}

const nomeCategoria = (c: Articolo['category']): string =>
  typeof c === 'object' && c !== null ? (c.name ?? '') : ''

const nomiAutori = (a: Articolo['authors']): string =>
  (a ?? [])
    .map((x) => (typeof x === 'object' && x !== null ? (x.name ?? '') : ''))
    .filter(Boolean)
    .join(', ')

export async function Dashboard({ initPageResult }: AdminViewServerProps) {
  const { req } = initPageResult
  const payload = req.payload
  const utente = req.user as { id: string; name?: string; role?: StaffRole } | undefined
  const isEditor = roleAtLeast(utente?.role, 'editor')

  /*
   * Tutte le query in parallelo e ciascuna protetta: la dashboard è la prima
   * schermata dopo il login e non deve mai mostrare un errore di sistema
   * perché una sola delle cinque code non ha risposto (RNF-10).
   */
  const sicuro = async <T,>(fn: () => Promise<T>, ripiego: T): Promise<T> => {
    try {
      return await fn()
    } catch (err) {
      payload.logger.error(`[dashboard] blocco non caricato: ${(err as Error).message}`)
      return ripiego
    }
  }

  const [miei, inRevisione, programmati, hotTopic, moderazione] = await Promise.all([
    sicuro(
      async () =>
        (
          await payload.find({
            collection: 'articles',
            where: {
              and: [
                { _status: { not_equals: 'published' } },
                ...(utente?.id ? [{ authors: { contains: utente.id } }] : []),
              ],
            },
            sort: '-updatedAt',
            limit: 5,
            depth: 1,
            req,
          })
        ).docs as unknown as Articolo[],
      [],
    ),
    sicuro(
      async () =>
        (
          await payload.find({
            collection: 'articles',
            where: { editorialStatus: { equals: 'in_revisione' } },
            sort: 'updatedAt',
            limit: 5,
            depth: 1,
            req,
          })
        ).docs as unknown as Articolo[],
      [],
    ),
    sicuro(
      async () =>
        (
          await payload.find({
            collection: 'articles',
            where: {
              and: [
                { _status: { not_equals: 'published' } },
                { editorialStatus: { equals: 'approvato' } },
                { publishedAt: { greater_than: new Date().toISOString() } },
              ],
            },
            sort: 'publishedAt',
            limit: 5,
            depth: 1,
            req,
          })
        ).docs as unknown as Articolo[],
      [],
    ),
    sicuro(
      async () =>
        (
          await payload.find({
            collection: 'hot-topics',
            where: { status: { equals: 'nuovo' } },
            sort: '-score',
            limit: 3,
            req,
          })
        ).docs as unknown as Array<{ id: string; title: string; score?: number; detectedAt?: string }>,
      [],
    ),
    sicuro(() => contaModerazione(), { inAttesa: 0, segnalazioniAperte: 0 }),
  ])

  const rilevanza = (s?: number) =>
    (s ?? 0) >= 70 ? 'alta' : (s ?? 0) >= 45 ? 'media' : 'bassa'

  return (
    <div className="cruscotto">
      <header className="cruscotto__testata">
        <div>
          <h1 className="cruscotto__saluto">
            {saluto()}
            {utente?.name ? `, ${utente.name.split(' ')[0]}` : ''}
          </h1>
          <p className="cruscotto__sottotitolo">
            {isEditor
              ? 'Ecco cosa aspetta una decisione in redazione.'
              : 'Ecco a che punto sono i tuoi pezzi.'}
          </p>
        </div>
        <Link className="cruscotto__nuovo" href="/admin/collections/articles/create">
          + Nuovo articolo
        </Link>
      </header>

      <div className="cruscotto__griglia">
        {/* ---------- 1. I miei pezzi in lavorazione ---------- */}
        <section className="riquadro">
          <div className="riquadro__testata">
            <h2>{isEditor ? 'I tuoi pezzi in lavorazione' : 'In lavorazione'}</h2>
            <Link href="/admin/collections/articles">Vai ad Articoli →</Link>
          </div>
          <p className="riquadro__nota">bozze e articoli non ancora pubblicati a tua firma</p>

          {miei.length === 0 ? (
            <p className="riquadro__vuoto">
              Non hai pezzi aperti. Quando ne inizi uno lo ritrovi qui con lo stato aggiornato.
            </p>
          ) : (
            miei.map((a) => (
              <Link key={a.id} className="voce" href={`/admin/collections/articles/${a.id}`}>
                <span className="voce__testo">
                  <span className="voce__titolo">{a.title}</span>
                  <span className="voce__meta">
                    {nomeCategoria(a.category)} · modificato {eta(a.updatedAt)}
                  </span>
                </span>
                <PastigliaStato stato={statoVisibile(a)} />
              </Link>
            ))
          )}
        </section>

        {/* ---------- 2. In attesa di revisione ---------- */}
        <section className="riquadro">
          <div className="riquadro__testata">
            <h2>In attesa di revisione</h2>
            <Link href="/admin/collections/articles?where[editorialStatus][equals]=in_revisione">
              Apri la coda →
            </Link>
          </div>
          <p className="riquadro__nota">
            {isEditor
              ? 'in ordine di attesa: i più fermi per primi'
              : 'i tuoi pezzi consegnati alla revisione'}
          </p>

          {inRevisione.length === 0 ? (
            <p className="riquadro__vuoto">
              Nessun articolo è in revisione in questo momento.
            </p>
          ) : (
            inRevisione.map((a) => (
              <Link key={a.id} className="voce" href={`/admin/collections/articles/${a.id}`}>
                <span className="voce__testo">
                  <span className="voce__titolo">{a.title}</span>
                  <span className="voce__meta">
                    {nomiAutori(a.authors) || 'senza firma'} · {nomeCategoria(a.category)}
                  </span>
                </span>
                <span className="voce__eta">{eta(a.updatedAt)}</span>
              </Link>
            ))
          )}
        </section>

        {/* ---------- 3. Programmati ---------- */}
        <section className="riquadro">
          <div className="riquadro__testata">
            <h2>Programmati</h2>
            <Link href="/admin/collections/articles?where[_status][equals]=draft">
              Tutti →
            </Link>
          </div>
          <p className="riquadro__nota">prossime uscite in ordine cronologico</p>

          {programmati.length === 0 ? (
            <p className="riquadro__vuoto">Nessuna pubblicazione programmata.</p>
          ) : (
            programmati.map((a) => (
              <Link key={a.id} className="voce voce--orario" href={`/admin/collections/articles/${a.id}`}>
                <span className="voce__quando">
                  <span className="voce__ora">
                    {a.publishedAt ? formattaOra.format(new Date(a.publishedAt)) : ''}
                  </span>
                  <span className="voce__giorno">
                    {a.publishedAt ? formatta.format(new Date(a.publishedAt)) : ''}
                  </span>
                </span>
                <span className="voce__testo">
                  <span className="voce__titolo">{a.title}</span>
                  <span className="voce__meta">
                    {nomeCategoria(a.category)} · {nomiAutori(a.authors)}
                  </span>
                </span>
              </Link>
            ))
          )}
        </section>

        {/* ---------- 4. Hot topic ---------- */}
        <section className="riquadro">
          <div className="riquadro__testata">
            <h2>Hot topic suggeriti</h2>
            <Link href="/admin/hot-topic">Tutti gli argomenti →</Link>
          </div>
          <p className="riquadro__nota">
            proposte dell’assistente: nessun testo raggiunge il portale senza revisione
          </p>

          {hotTopic.length === 0 ? (
            <p className="riquadro__vuoto">
              Nessun nuovo argomento. La rilevazione gira in automatico sulle fonti configurate.
            </p>
          ) : (
            hotTopic.map((t) => (
              <Link key={t.id} className="voce" href={`/admin/hot-topic?argomento=${t.id}`}>
                <span className="voce__testo">
                  <span className="voce__titolo voce__titolo--breve">{t.title}</span>
                  <span className="voce__meta">rilevato {eta(t.detectedAt)}</span>
                </span>
                <span className={`voce__rilevanza voce__rilevanza--${rilevanza(t.score)}`}>
                  {Math.round(t.score ?? 0)}
                </span>
              </Link>
            ))
          )}
        </section>

        {/* ---------- 5. Moderazione ---------- */}
        {isEditor && (
          <section className="riquadro">
            <div className="riquadro__testata">
              <h2>Commenti in moderazione</h2>
              <Link href="/admin/moderazione">Vai a Moderazione →</Link>
            </div>

            <div className="cifre">
              <div className="cifra">
                <span className="cifra__numero">{moderazione.inAttesa}</span>
                <span className="cifra__etichetta">in attesa di approvazione</span>
              </div>
              <div className="cifra cifra--allarme">
                <span className="cifra__numero">{moderazione.segnalazioniAperte}</span>
                <span className="cifra__etichetta">segnalazioni aperte</span>
              </div>
            </div>

            <p className="riquadro__coda">
              I commenti restano invisibili sul portale finché non vengono approvati: la coda
              non blocca nulla, ma più resta ferma meno la discussione è viva.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}

export default Dashboard
