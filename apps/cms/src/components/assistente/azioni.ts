'use server'

import { getPayload } from 'payload'

import config from '@/payload.config'
import { leggiConfigurazione } from '@/lib/ai/client'
import {
  proponiAssistenza,
  TESTO_MAX,
  type PropostaAssistente,
  type Strumento,
} from '@/lib/ai/assistenza'
import { redattoreCorrente } from '@/lib/sessioneRedazione'
import {
  DESCRIZIONE_MAX,
  generaImmagini,
  leggiConfigurazioneImmagini,
  type ImmagineProposta,
} from '@/lib/ai/immagini'

/**
 * Azioni del pannello "Assistente AI" nell'editor — RF-AI-06.
 *
 * Restituiscono solo proposte: nessuna tocca il documento. E' il pannello, nel
 * browser, ad applicare al testo cio' che il redattore accetta, nell'editor
 * aperto e quindi ancora da salvare.
 */

type Esito<T> = { ok: true; dati: T } | { ok: false; messaggio: string }

const STRUMENTI: Strumento[] = ['riscrivi', 'sintetizza', 'titoli', 'seo']

/** Il pannello esiste anche ad AI spenta: mostra lo stato invece di sparire (RNF-10). */
export async function statoAssistente(): Promise<{
  attivo: boolean
  messaggio: string
  immagini: { attivo: boolean; messaggio: string; quante: number; formato: string }
}> {
  const sessione = await redattoreCorrente()
  if (!sessione.ok) {
    return {
      attivo: false,
      messaggio: sessione.messaggio,
      immagini: { attivo: false, messaggio: sessione.messaggio, quante: 0, formato: '' },
    }
  }

  const payload = await getPayload({ config })
  const conf = await leggiConfigurazione(payload)
  const img = await leggiConfigurazioneImmagini(payload)
  return {
    attivo: conf.enabled,
    messaggio: conf.disabledMessage,
    immagini: {
      attivo: img.attivo,
      messaggio: img.messaggio,
      quante: img.quante,
      formato: img.formato,
    },
  }
}

export async function chiediProposta(input: {
  strumento: Strumento
  passaggio: string
  articolo: string
  titolo: string
}): Promise<Esito<PropostaAssistente>> {
  const sessione = await redattoreCorrente()
  if (!sessione.ok) return sessione

  if (!STRUMENTI.includes(input.strumento)) {
    return { ok: false, messaggio: 'Strumento non riconosciuto.' }
  }

  const passaggio = String(input.passaggio ?? '').trim()
  const articolo = String(input.articolo ?? '').trim()
  const titolo = String(input.titolo ?? '').trim()

  const sulTesto = input.strumento === 'riscrivi' || input.strumento === 'sintetizza'
  if (sulTesto && passaggio.length < 20) {
    return {
      ok: false,
      messaggio: 'Il passaggio è troppo breve: seleziona almeno una frase nel corpo.',
    }
  }
  if (!sulTesto && articolo.length < 200) {
    return {
      ok: false,
      messaggio: 'Il corpo è ancora troppo breve per proporre titoli o suggerimenti utili.',
    }
  }
  if (articolo.length > TESTO_MAX) {
    return {
      ok: false,
      messaggio: `L’articolo supera i ${TESTO_MAX.toLocaleString('it-IT')} caratteri che l’assistente accetta.`,
    }
  }

  const payload = await getPayload({ config })
  const esito = await proponiAssistenza(payload, sessione.utente.id, {
    strumento: input.strumento,
    passaggio,
    articolo,
    titolo,
  })

  return esito.ok ? esito : { ok: false, messaggio: esito.messaggio }
}

/* -------------------------------------------------------------------------- */
/* Immagini — RF-AI-07                                                        */
/* -------------------------------------------------------------------------- */

const FORMATI_AMMESSI = ['image/jpeg', 'image/png', 'image/webp']
const DIMENSIONE_MAX = 10 * 1024 * 1024

export async function proponiImmagini(
  descrizione: string,
): Promise<Esito<{ immagini: ImmagineProposta[]; scartate: number }>> {
  const sessione = await redattoreCorrente()
  if (!sessione.ok) return sessione

  const testo = String(descrizione ?? '').trim()
  if (testo.length < 15) {
    return { ok: false, messaggio: 'Descrivi l’immagine con qualche parola in più.' }
  }
  if (testo.length > DESCRIZIONE_MAX) {
    return { ok: false, messaggio: `La descrizione supera i ${DESCRIZIONE_MAX} caratteri.` }
  }

  const payload = await getPayload({ config })
  const esito = await generaImmagini(payload, sessione.utente.id, testo)
  return esito.ok
    ? { ok: true, dati: { immagini: esito.immagini, scartate: esito.scartate } }
    : esito
}

/**
 * Salva la proposta scelta nella media library e ne restituisce l'id, che il
 * pannello mette nel campo copertina dell'articolo aperto (ancora da salvare).
 *
 * L'immagine torna dal browser: si accetta solo se e' davvero un'immagine,
 * nei formati e nelle dimensioni di Gemini.
 */
export async function salvaCopertina(input: {
  base64: string
  mimeType: string
  descrizione: string
}): Promise<Esito<{ id: string }>> {
  const sessione = await redattoreCorrente()
  if (!sessione.ok) return sessione

  if (!FORMATI_AMMESSI.includes(input.mimeType)) {
    return { ok: false, messaggio: 'Formato immagine non ammesso.' }
  }
  const dati = Buffer.from(String(input.base64 ?? ''), 'base64')
  if (dati.length === 0 || dati.length > DIMENSIONE_MAX) {
    return { ok: false, messaggio: 'Immagine non valida.' }
  }

  const sharp = (await import('sharp')).default
  const info = await sharp(dati)
    .metadata()
    .catch(() => null)
  if (!info?.width || !info.height) return { ok: false, messaggio: 'Immagine non valida.' }

  const descrizione = String(input.descrizione ?? '').trim()
  const estensione = input.mimeType.split('/')[1] === 'jpeg' ? 'jpg' : input.mimeType.split('/')[1]
  const payload = await getPayload({ config })

  try {
    const media = await payload.create({
      collection: 'media',
      overrideAccess: true, // `aiGenerated` lo puo' impostare solo il sistema
      data: {
        // Punto di partenza, non testo definitivo: il redattore lo rivede nella media library.
        alt: descrizione.slice(0, 250),
        aiGenerated: true,
      },
      file: {
        data: dati,
        mimetype: input.mimeType,
        name: `copertina-ai-${Date.now()}.${estensione}`,
        size: dati.length,
      },
    })
    return { ok: true, dati: { id: String(media.id) } }
  } catch (err) {
    payload.logger.error(`Salvataggio copertina AI fallito: ${(err as Error).message}`)
    return { ok: false, messaggio: 'Salvataggio dell’immagine non riuscito. Riprova.' }
  }
}
