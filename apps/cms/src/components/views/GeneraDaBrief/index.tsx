import type { AdminViewServerProps } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'

import { leggiConfigurazione } from '@/lib/ai/client'
import { ModuloBrief } from './ModuloBrief'

import '../ai.scss'

/**
 * Generazione assistita a partire da un brief — RF-AI-05, impaginazione dai
 * design (Generazione da Brief v1).
 */
async function ContenutoGeneraDaBrief({ initPageResult }: AdminViewServerProps) {
  const { req } = initPageResult
  const payload = req.payload

  const conf = await leggiConfigurazione(payload)

  let categorie: Array<{ id: string; nome: string }> = []
  try {
    const cats = await payload.find({ collection: 'categories', limit: 50, sort: 'order', req })
    categorie = cats.docs.map((c) => {
      const x = c as unknown as { id: string; name: string }
      return { id: String(x.id), nome: x.name }
    })
  } catch {
    categorie = []
  }

  return (
    <div className="ai-vista">
      <div className="ai-principio">
        <span className="ai-principio__etichetta">Assistente AI</span>
        <span className="ai-principio__testo">
          Quello che leggi qui è una proposta: nulla viene salvato o pubblicato senza una
          decisione della redazione.
        </span>
      </div>

      {!conf.enabled ? (
        <div className="ai-vista__corpo">
          <div className="ai-fermo">
            <span className="ai-fermo__segno" aria-hidden="true">
              !
            </span>
            <div>
              <h1>Assistente non attivo</h1>
              <p>{conf.disabledMessage}</p>
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
      ) : (
        <ModuloBrief categorie={categorie} />
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
export async function GeneraDaBrief(props: AdminViewServerProps) {
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
      <ContenutoGeneraDaBrief {...props} />
    </DefaultTemplate>
  )
}

export default GeneraDaBrief
