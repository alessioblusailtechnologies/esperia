/**
 * Contratto comune degli adattatori di fonte — RF-AI-01.
 *
 * Ogni tipo di fonte (RSS, NewsAPI, GDELT...) ha un adattatore che sa parlare
 * con quel provider e restituisce notizie in questa forma. Tutto cio' che sta a
 * valle — raggruppamento, punteggio, salvataggio — non sa da dove arrivino:
 * aggiungere un provider vuol dire scrivere un adattatore, non toccare il job.
 */

export interface NotiziaNormalizzata {
  titolo: string
  url: string
  testata: string
  /** ISO 8601. Se la fonte non la dichiara, l'adattatore mette l'ora di lettura. */
  dataPubblicazione: string
  /** Prime righe del testo, quando la fonte le fornisce: servono a sintesi e affinita'. */
  estratto?: string
}

export interface FonteDaLeggere {
  id: string
  name: string
  type: string
  endpoint: string
  query?: string | null
}

export type Adattatore = (fonte: FonteDaLeggere) => Promise<NotiziaNormalizzata[]>
