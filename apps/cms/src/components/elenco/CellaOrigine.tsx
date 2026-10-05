'use client'

import { Icona } from '@/components/Icona'

/**
 * Colonna «Origine» dell'elenco articoli.
 *
 * Dice se un pezzo è nato in redazione o da una bozza AI e, per le bozze AI,
 * a che punto è la verifica: i punti ancora aperti, oppure «verificata e
 * firmata». È il segno oro che ritorna in tutto il backoffice.
 */

const PARTENZE: Record<string, string> = {
  brief: 'AI da appunti',
  hot_topic: 'AI da hot topic',
}

export function CellaOrigine({ rowData }: { rowData?: Record<string, unknown> }) {
  const ai = (rowData?.ai ?? {}) as {
    origin?: string | null
    checks?: Array<{ fatto?: boolean }> | null
    humanReviewed?: boolean | null
  }

  const partenza = ai.origin ? PARTENZE[ai.origin] : undefined
  if (!partenza) return <span className="cella-origine__redazione">Redazione</span>

  const aperti = Array.isArray(ai.checks) ? ai.checks.filter((c) => !c?.fatto).length : 0
  const stato = ai.humanReviewed
    ? 'Verificata e firmata'
    : aperti > 0
      ? `${aperti} da verificare`
      : 'Da rileggere e firmare'

  return (
    <span className="cella-origine">
      <span className="segno-ai segno-ai--con-icona">
        <Icona nome="ai" dimensione={12} tratto={2} />
        {partenza}
      </span>
      <span className={`cella-origine__stato${ai.humanReviewed ? ' cella-origine__stato--ok' : ''}`}>
        {stato}
      </span>
    </span>
  )
}

export default CellaOrigine
