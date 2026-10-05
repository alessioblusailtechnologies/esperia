import type { TaskConfig } from 'payload'
import { rilevaHotTopic, type EsitoRilevamento } from '@/lib/hotTopic/rileva'

/**
 * Job periodico di rilevamento degli hot topic — RF-AI-01, RF-AI-02.
 *
 * Gira ogni cinque minuti, che e' anche l'intervallo minimo ammesso sulle
 * fonti: e' il job a decidere quali fonti interrogare, in base alla
 * `pollIntervalMinutes` di ciascuna. Lo scheduler di Payload non accoda un
 * nuovo giro finche' il precedente non e' finito, quindi due esecuzioni non si
 * sovrappongono.
 *
 * Nessun nuovo tentativo in caso di errore: il giro successivo arriva comunque
 * fra cinque minuti, e gli errori delle singole fonti finiscono nella loro
 * diagnostica senza far fallire il job.
 */
export const rilevaHotTopicTask: TaskConfig<{ input: object; output: EsitoRilevamento }> = {
  slug: 'rileva-hot-topic',
  label: 'Rilevamento hot topic dalle fonti',
  retries: 0,
  schedule: [{ cron: '*/5 * * * *', queue: 'default' }],
  handler: async ({ req }) => {
    const esito = await rilevaHotTopic(req.payload)
    if (!esito.saltato) req.payload.logger.info({ msg: '[hot-topic] giro completato', ...esito })
    return { output: esito }
  },
}
