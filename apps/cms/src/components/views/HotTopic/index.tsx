import type { AdminViewServerProps } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'

import { leggiConfigurazione } from '@/lib/ai/client'
import { ElencoHotTopic, type ArgomentoVista } from './ElencoHotTopic'

import '../ai.scss'

/**
 * Hot topic proposti dall'assistente — RF-AI-02, impaginazione dai design
 * (Hot Topic v1).
 *
 * La vista esiste anche quando l'AI è spenta: in quel caso mostra lo stato di
 * indisponibilità previsto dai design invece di sparire dal menu. È la forma
 * concreta di RNF-10 — la redazione deve capire *perché* non ci sono proposte,
 * e vedere che il resto del lavoro non è bloccato.
 */
async function ContenutoHotTopic({ initPageResult }: AdminViewServerProps) {
  const { req } = initPageResult
  const payload = req.payload

  const conf = await leggiConfigurazione(payload)

  let argomenti: ArgomentoVista[] = []
  let categorie: Array<{ id: string; nome: string }> = []
  let errore: string | null = null

  try {
    const [topics, cats] = await Promise.all([
      payload.find({
        collection: 'hot-topics',
        where: { status: { in: ['nuovo', 'in_lavorazione'] } },
        sort: '-score',
        limit: 40,
        depth: 1,
        req,
      }),
      payload.find({ collection: 'categories', limit: 50, sort: 'order', req }),
    ])

    argomenti = topics.docs.map((d) => {
      const t = d as unknown as {
        id: string
        title: string
        summary?: string | null
        score?: number
        status: string
        detectedAt?: string
        keywords?: string[] | null
        suggestedCategory?: { id: string; name: string } | string | null
        references?: Array<{ title?: string; url?: string; publisher?: string }> | null
      }

      return {
        id: String(t.id),
        titolo: t.title,
        sintesi: t.summary ?? '',
        punteggio: Math.round(t.score ?? 0),
        stato: t.status,
        rilevatoIl: t.detectedAt ?? null,
        paroleChiave: t.keywords ?? [],
        categoriaSuggerita:
          typeof t.suggestedCategory === 'object' && t.suggestedCategory
            ? { id: String(t.suggestedCategory.id), nome: t.suggestedCategory.name }
            : null,
        fonti: (t.references ?? []).map((r) => ({
          titolo: r.title ?? '',
          url: r.url ?? '',
          testata: r.publisher ?? '',
        })),
      }
    })

    categorie = cats.docs.map((c) => {
      const x = c as unknown as { id: string; name: string }
      return { id: String(x.id), nome: x.name }
    })
  } catch (err) {
    errore = (err as Error).message
    payload.logger.error(`[hot-topic] ${errore}`)
  }

  return (
    <div className="ai-vista">
      <div className="ai-principio">
        <span className="ai-principio__etichetta">Assistente AI</span>
        <span className="ai-principio__testo">
          L’AI propone, la redazione decide: ogni argomento resta un suggerimento e ogni testo
          generato entra nel flusso come bozza da revisionare.
        </span>
      </div>

      {!conf.enabled ? (
        <div className="ai-vista__corpo">
          <div className="ai-fermo">
            <span className="ai-fermo__segno" aria-hidden="true">
              !
            </span>
            <div>
              <h1>Rilevazione argomenti non attiva</h1>
              <p>
                {conf.disabledMessage} Nessuna proposta viene generata nel frattempo: il lavoro
                sugli articoli non è in alcun modo bloccato.
              </p>
              <p className="ai-fermo__azioni">
                <a className="azione azione--primaria" href="/admin/collections/articles/create">
                  Scrivi un articolo senza assistente →
                </a>
                <a className="azione" href="/admin/globals/ai-settings">
                  Impostazioni AI
                </a>
              </p>
            </div>
          </div>
        </div>
      ) : errore ? (
        <div className="ai-vista__corpo">
          <div className="ai-fermo">
            <span className="ai-fermo__segno" aria-hidden="true">
              !
            </span>
            <div>
              <h1>Elenco non disponibile</h1>
              <p>Non è stato possibile leggere gli argomenti rilevati.</p>
              <p className="ai-fermo__dettaglio">{errore}</p>
            </div>
          </div>
        </div>
      ) : (
        <ElencoHotTopic argomenti={argomenti} categorie={categorie} />
      )}
    </div>
  )
}

/**
 * Involucro con navigazione e barra superiore dell'admin.
 *
 * Payload monta le viste con path proprio FUORI dal template predefinito:
 * senza questo wrapper la schermata comparirebbe a tutta pagina, senza menu.
 */
export async function HotTopic(props: AdminViewServerProps) {
  const { initPageResult, params, searchParams } = props

  return (
    <DefaultTemplate
      i18n={initPageResult.req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={initPageResult.req.payload}
      permissions={initPageResult.permissions}
      req={initPageResult.req}
      searchParams={searchParams}
      user={initPageResult.req.user ?? undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <ContenutoHotTopic {...props} />
    </DefaultTemplate>
  )
}

export default HotTopic
