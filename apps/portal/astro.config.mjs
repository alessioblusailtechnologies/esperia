import { defineConfig } from 'astro/config'
import preact from '@astrojs/preact'
import node from '@astrojs/node'

const site = process.env.PUBLIC_SITE_URL ?? 'http://localhost:4321'

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
  output: 'server',
  adapter: node({ mode: 'standalone' }),

  integrations: [preact()],

  // Le isole sono poche e piccole: nessun bisogno di code-splitting aggressivo.
  build: { inlineStylesheets: 'auto' },

  vite: {
    resolve: {
      alias: { '@': new URL('./src', import.meta.url).pathname },
    },
  },

  image: {
    // Le varianti sono gia' generate da Payload al caricamento (RF-B-07):
    // il portale le serve, non le ricalcola.
    domains: [],
  },
})
