# Versione dimostrativa del portale

Il portale sa girare **senza CMS e senza database**. Con `MOCK=1` i contenuti
arrivano dalle fixture di questa cartella, la build diventa statica e il
risultato si pubblica su un hosting qualunque — è così che il Committente può
vedere il portale prima che la redazione esista.

```bash
pnpm --filter @esperia/portal build:demo     # genera apps/portal/dist
pnpm --filter @esperia/portal preview:demo   # lo serve su :4321
```

Il deploy su Render è descritto in [`render.yaml`](../../../../render.yaml).

---

## Il principio: si sostituisce il trasporto, non la logica

L'intercettazione è **una sola**, dentro `lib/payload.ts`:

```ts
if (MOCK) {
  const { rispondiMock } = await import('@/mock/api')
  return rispondiMock<T>(path)
}
```

`get<T>()` è la funzione che parla in HTTP con Payload. Sostituendo lei,
`mock/api.ts` deve rispondere ai percorsi REST di Payload con la stessa forma —
e **tutto il resto del portale resta il codice di produzione**: filtri,
impaginazione, ordinamento, articoli correlati, cache di processo, SEO, RSS,
sitemap, dati strutturati.

È la ragione della scelta: un mock che reimplementasse le pagine mostrerebbe al
Committente un portale diverso da quello che poi va online, e i difetti trovati
in revisione non sarebbero difetti veri.

## I file

| File | Cosa contiene |
|---|---|
| `contenuti.ts` | Il materiale editoriale: articoli, categorie, firme, pagine di servizio, impostazioni. **In cima ci sono le regole per aggiungerne: vanno rispettate.** |
| `dati.ts` | Costruisce le entità di `lib/types.ts` — Lexical, date, varianti immagine |
| `api.ts` | Finta API REST di Payload: instrada `/api/articles`, `/api/ricerca`, … |
| `ricerca-cliente.js` | Filtro della ricerca nel browser, iniettato come testo solo in modalità mock |
| `../../public/mock/media/` | Copertine generate, nelle quattro varianti che produrrebbe Payload |
| `../../scripts/genera-copertine.mjs` | Le rigenera (non gira in build: i file sono versionati) |

## Perché le immagini sono astratte e non fotografie

La cartella `Design portale Esperia/uploads` contiene quattro immagini, ma non
sono utilizzabili qui: tre ritraggono politici reali e identificabili, la quarta
è lo screenshot dell'interfaccia di un altro sito.

Accostare la fotografia di una persona vera a un articolo inventato, su un sito
pubblicamente raggiungibile, produce una notizia falsa credibile. Le copertine
sono quindi composizioni geometriche generate nella palette del progetto, tinte
per categoria: riempiono gli stessi slot, con le stesse proporzioni e lo stesso
comportamento LCP, senza affermare nulla su nessuno.

**Se il Committente vuole fotografie nella dimostrazione**, deve fornire
immagini con licenza d'uso: si sostituiscono i file in `public/mock/media/`
mantenendo i nomi, e non serve toccare il codice.

## Le altre difese

Non basta scegliere bene le immagini: gli articoli restano inventati.

- `robots.txt` risponde `Disallow: /` — la condizione in `robots.txt.ts`
  esclude esplicitamente la modalità mock, altrimenti un dominio dall'aria
  definitiva verrebbe considerato produzione e indicizzato;
- `render.yaml` aggiunge `X-Robots-Tag: noindex, nofollow`;
- una fascia in cima a ogni pagina dichiara che i contenuti sono di esempio;
- i testi citano istituzioni e ruoli, **mai persone reali per nome**, e non
  contengono dichiarazioni virgolettate attribuite a individui reali.

## Differenze note rispetto al portale vero

Sono tutte conseguenze del fatto che un sito statico non ha un server che
risponde alle richieste. Vanno tenute a mente leggendo i riscontri del
Committente: **non sono difetti del portale.**

| Cosa | In produzione | Nella dimostrazione |
|---|---|---|
| Ricerca | Full-text Postgres, stemming italiano, ranking per pertinenza | Filtro nel browser su tutte le schede già in pagina; nessuno stemming, ordine di pubblicazione |
| Impaginazione | `?pagina=2` risolto dal server | Il corpus è di 20 articoli: ogni elenco sta in una pagina e la paginazione non compare |
| Commenti | Supabase con RLS | Discussione di esempio in sola lettura |
| Accesso e registrazione | Da realizzare (RF-C-01/02) | Segnaposto che dichiara la lavorazione in corso |
| Middleware | Redirect, manutenzione, header di cache | Saltato: gli header li mette l'hosting |
| Anteprima bozze, invalidazione cache | Endpoint attivi | Rimossi dalla build |

## Due trappole già pagate

**Una sola rotta on-demand rende server l'intera build.** Astro decide guardando
le singole rotte: bastava `prerender = false` in `/api/preview` per far fallire
la build statica con `NoAdapterInstalled`. Si risolve nell'hook
`astro:route:setup` — `astro:routes:resolved` non serve, è di sola lettura.
Vedi `astro.config.mjs`.

**`<script is:inline>{`…`}</script>` non fa quello che sembra.** Con `is:inline`
Astro non valuta l'espressione: nell'HTML finiscono i delimitatori del template
literal e il browser esegue un blocco vuoto — **senza errori in console**, il che
lo rende insidioso da diagnosticare. Per questo `ricerca-cliente.js` è un file
vero, letto con `?raw` e scritto con `set:html`.

## Quando il CMS sarà popolato

Questa modalità non va rimossa: resta utile per lavorare al portale senza
avviare CMS e database, e le fixture sono l'unico posto del progetto dove la
forma del contratto HTTP è scritta come dato invece che come tipo.
