import { defineConfig } from 'astro/config'
import preact from '@astrojs/preact'
import node from '@astrojs/node'

const site = process.env.PUBLIC_SITE_URL ?? 'http://localhost:4321'

/*
 * Modalita' dimostrativa (MOCK=1) — vedi src/lib/modalita.ts.
 *
 * I contenuti arrivano dalle fixture invece che dal CMS, quindi sono noti al
 * momento della build: il sito puo' essere generato per intero e pubblicato
 * come statico, senza server e senza database. E' cio' che permette di
 * mostrarlo al Committente su un hosting gratuito.
 *
 * La build reale resta invariata: SSR con adattatore Node.
 */
const mock = process.env.MOCK === '1'

/*
 * Le due rotte on-demand del portale nella build dimostrativa.
 *
 * /api/preview chiede al CMS una bozza, /api/revalidate e' chiamata dal CMS per
 * invalidare la cache: senza CMS non hanno interlocutore. Sono anche le uniche
 * due rotte che dichiarano `prerender = false`, e questo basta a rendere server
 * l'INTERA build — Astro decide guardando le singole rotte, e senza adattatore
 * si ferma con NoAdapterInstalled.
 *
 * Vanno quindi disinnescate in due punti diversi, perche' due meccanismi
 * distinti leggono quei file:
 *
 *  1. `astro:route:setup` rimette `prerender` a vero. E' l'ultimo momento utile
 *     prima che Astro scelga il tipo di build. (`astro:routes:resolved` non
 *     serve allo scopo: e' di sola lettura, rimuovere voci da li' non ha
 *     effetto — verificato.)
 *  2. Un plugin Vite sostituisce il corpo dei due moduli con una risposta 404.
 *     Senza, Astro proverebbe a pregenerarli davvero: /api/revalidate non ha un
 *     GET e la build emette un avviso, /api/preview produrrebbe un redirect
 *     congelato verso un CMS che non esiste.
 *
 * I file sorgente non vengono toccati: la build reale usa lo stesso codice.
 */
function marcaEndpointComePregenerati() {
  return {
    name: 'esperia-mock-endpoint-pregenerati',
    hooks: {
      'astro:route:setup': ({ route }) => {
        if (route.component?.replace(/\\/g, '/').includes('/pages/api/')) {
          route.prerender = true
        }
      },
    },
  }
}

function neutralizzaEndpointOnDemand() {
  const bersaglio = /[\\/]pages[\\/]api[\\/](preview|revalidate)\.ts$/

  return {
    name: 'esperia-mock-neutralizza-endpoint',
    enforce: 'pre',
    transform(_codice, id) {
      if (!bersaglio.test(id)) return null
      return [
        'export const prerender = true',
        'export const GET = () =>',
        '  new Response(JSON.stringify({ errore: "Non disponibile nella versione dimostrativa" }), {',
        '    status: 404,',
        '    headers: { "content-type": "application/json" },',
        '  })',
        '',
      ].join('\n')
    },
  }
}

export default defineConfig({
  site,

  // Rendering lato server con cache HTTP davanti.
  //
  // Perche' non `static`: le notizie cambiano di continuo e ricostruire tutto il
  // sito a ogni pubblicazione non e' praticabile. Perche' non l'ISR di un adapter
  // specifico: l'hosting non e' ancora deciso (V-02), e legarsi a una piattaforma
  // ora costerebbe una riscrittura dopo. Le pagine dichiarano
  // Cache-Control: s-maxage + stale-while-revalidate e il CMS invalida via
  // /api/revalidate: funziona identico su Vercel, Netlify, Cloudflare o Nginx.
  output: mock ? 'static' : 'server',
  adapter: mock ? undefined : node({ mode: 'standalone' }),

  integrations: [preact(), ...(mock ? [marcaEndpointComePregenerati()] : [])],

  // Le isole sono poche e piccole: nessun bisogno di code-splitting aggressivo.
  build: { inlineStylesheets: 'auto' },

  vite: {
    resolve: {
      alias: { '@': new URL('./src', import.meta.url).pathname },
    },
    plugins: mock ? [neutralizzaEndpointOnDemand()] : [],
  },

  image: {
    // Le varianti sono gia' generate da Payload al caricamento (RF-B-07):
    // il portale le serve, non le ricalcola.
    domains: [],
  },
})
