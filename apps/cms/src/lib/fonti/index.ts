import type { Adattatore } from './tipi'
import { leggiRss } from './rss'

export type { Adattatore, FonteDaLeggere, NotiziaNormalizzata } from './tipi'

/**
 * Registro degli adattatori, per valore del campo `type` delle fonti.
 *
 * I tipi a pagamento (NewsAPI, SerpAPI) aspettano la scelta del Committente
 * (V-02); GDELT e l'endpoint personalizzato verranno dopo. Una fonte di un tipo
 * assente da qui viene segnata in errore con un messaggio esplicito, invece di
 * essere ignorata in silenzio.
 */
export const ADATTATORI: Partial<Record<string, Adattatore>> = {
  rss: leggiRss,
}
