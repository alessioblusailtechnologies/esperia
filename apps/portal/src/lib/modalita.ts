/**
 * Modalita' dimostrativa.
 *
 * Con MOCK=1 il portale non parla con il CMS: i contenuti arrivano dalle
 * fixture in `src/mock/`, la build diventa statica e il sito puo' essere
 * pubblicato su un hosting senza database (vedi render.yaml).
 *
 * Serve a far vedere il portale al Committente prima che il CMS sia
 * popolato. Non e' una modalita' di produzione: `robots.txt` blocca
 * l'indicizzazione e il piede dichiara che i contenuti sono di esempio.
 *
 * Letta da process.env perche' il valore serve durante la build statica, che
 * gira in Node. Le isole non la usano: le pagine passano loro cio' che serve
 * come proprieta'.
 */
export const MOCK =
  typeof process !== 'undefined' && process.env?.MOCK === '1'
