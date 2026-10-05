'use client'

import { useEffect } from 'react'
import { useStepNav } from '@payloadcms/ui'

/**
 * Briciole della barra in alto per le viste costruite da noi (Hot topic,
 * Moderazione): le schermate di Payload le impostano da sole, le nostre no,
 * e la barra resterebbe vuota.
 */
export function Briciole({ voci }: { voci: Array<{ label: string; url?: string }> }) {
  const { setStepNav } = useStepNav()
  const chiave = JSON.stringify(voci)

  useEffect(() => {
    setStepNav(JSON.parse(chiave))
  }, [chiave, setStepNav])

  return null
}

export default Briciole
