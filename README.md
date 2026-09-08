# Esperia — piattaforma editoriale digitale

Monorepo della piattaforma Esperia: portale news pubblico, sezione community,
backoffice editoriale e modulo AI.

Fornitore: **Blusail Technologies S.r.l.s.** · Committente: **Esperia S.r.l.**
Requisiti: [`docs/Analisi_Requisiti_Esperia.docx`](docs/Analisi_Requisiti_Esperia.docx)

---

## Struttura

```
apps/
  portal/     Astro 7 — portale pubblico e community (SSR + cache CDN)
  cms/        Payload 3 su Next 16 — backoffice, API di contenuto, modulo AI
packages/
  shared/     Costanti e tipi di dominio condivisi (ruoli, workflow, community)
supabase/
  migrations/ Schema community (RLS) e indice di ricerca full-text
docs/         Analisi dei requisiti, architettura, tracciabilità
```

Le due applicazioni sono **deployabili separatamente**. Il portale parla con il
CMS solo via HTTP: nessuna dipendenza a compile time fra i due.

---

## Avvio in locale

**Prerequisiti:** Node ≥ 20.9, pnpm 9 (`corepack enable`), un Postgres 16
raggiungibile.

```bash
pnpm install

# 1. Configurazione
cp apps/cms/.env.example    apps/cms/.env
cp apps/portal/.env.example apps/portal/.env
# compilare almeno DATABASE_URI e PAYLOAD_SECRET (openssl rand -base64 32)

# 2. Primo avvio del CMS: crea lo schema `payload` in automatico
pnpm dev:cms

# 3. Migrazioni del database (vedi "Ordine di inizializzazione" più sotto)
psql "$DATABASE_URI" -f supabase/migrations/0001_community.sql
psql "$DATABASE_URI" -f supabase/migrations/0002_search_index.sql

# 4. Dati iniziali: amministratore, categorie, pagine di servizio
pnpm --filter @esperia/cms seed

# 5. Tutto insieme
pnpm dev
```

| Servizio   | URL                             |
| ---------- | ------------------------------- |
| Portale    | http://localhost:4321           |
| Backoffice | http://localhost:3001/admin     |
| API CMS    | http://localhost:3001/api       |

Credenziali iniziali del seed: `admin@esperia.local` / `esperia-cambiami-subito`
(sovrascrivibili con `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD`).
**Vanno cambiate al primo accesso.**

---

## Ordine di inizializzazione

L'ordine conta, ed è l'unico punto in cui i due sistemi si toccano nel database:

1. **CMS** al primo avvio crea lo schema `payload` (tabelle, indici, enum).
2. **`0001_community.sql`** crea lo schema `public` della community con le
   policy RLS. Indipendente dal punto 1, si può eseguire anche prima.
3. **`0002_search_index.sql`** crea lo schema `ricerca`, che legge
   `payload.articles`: **richiede che il punto 1 sia già avvenuto.**

Payload gestisce il proprio schema da solo e in sviluppo lo sincronizza con la
configurazione, eliminando ciò che non riconosce. Per questo l'indice di ricerca
vive in uno schema separato e non come colonna aggiunta alle sue tabelle —
dettagli in [`docs/architettura.md`](docs/architettura.md).

---

## Comandi

| Comando               | Effetto                                          |
| --------------------- | ------------------------------------------------ |
| `pnpm dev`            | Portale e CMS insieme                            |
| `pnpm dev:portal`     | Solo portale                                     |
| `pnpm dev:cms`        | Solo backoffice                                  |
| `pnpm build`          | Build di produzione di entrambi                  |
| `pnpm typecheck`      | Controllo dei tipi su tutto il monorepo          |
| `pnpm --filter @esperia/cms generate:types` | Rigenera `payload-types.ts` |
| `pnpm --filter @esperia/cms seed`           | Popolamento iniziale        |
| `pnpm --filter @esperia/cms seed:demo`      | Contenuti dimostrativi (mai in produzione) |

---

## Design

Il portale implementa i design consegnati dal Committente
(`Design portale Esperia/Pagine` — Home, Articolo, Listing, Ricerca v1):
fondo carta caldo, Newsreader per i titoli, Archivo per l'interfaccia, accento
rosso, pastiglie e pannelli come da tavole.

- tutti i valori visivi (colore, tipografia, spaziatura, raggi, larghezze) sono
  variabili CSS in **[`apps/portal/src/styles/tokens.css`](apps/portal/src/styles/tokens.css)**;
- nessun componente contiene un colore o una dimensione scritti a mano;
- una revisione della grafica si applica cambiando quei valori, senza toccare
  routing, metadati, dati strutturati o confini delle isole.

Il **backoffice** segue le tavole `Pagine backoffice`: colonna scura con le code
di lavoro, accento verde-petrolio, pastiglie di stato, dashboard a cinque
riquadri. Il tema vive in `apps/cms/src/app/(payload)/custom.scss`, che
ridefinisce la scala di colori di Payload; navigazione, dashboard, moderazione,
hot topic e generazione da brief sono componenti in `apps/cms/src/components/`.

**Tema scuro:** i design definiscono una sola palette, chiara. Non ne abbiamo
inventata una scura — sarebbe una scelta di design non concordata. La struttura
a token la rende innestabile ridefinendo un solo blocco.

---

## Versione dimostrativa

Il portale sa girare **senza CMS e senza database**: con `MOCK=1` i contenuti
arrivano da fixture, la build diventa statica e il risultato si pubblica su un
hosting qualunque. Serve a far vedere il portale al Committente prima che la
redazione esista, e a lavorare al portale senza avviare il CMS.

```bash
pnpm --filter @esperia/portal build:demo     # genera apps/portal/dist
pnpm --filter @esperia/portal preview:demo   # lo serve su :4321
```

L'intercettazione è una sola, sul trasporto HTTP verso il CMS: filtri,
impaginazione, articoli correlati, SEO, RSS e sitemap restano il codice di
produzione. Deploy in [`render.yaml`](render.yaml), dettagli e differenze note
in **[`apps/portal/src/mock/README.md`](apps/portal/src/mock/README.md)**.

> I contenuti sono inventati. La dimostrazione risponde `Disallow: /`, dichiara
> in ogni pagina di essere tale e non usa fotografie di persone reali: le ragioni
> stanno nel README della cartella `mock`, e vanno rispettate aggiungendo
> contenuti.

---

## Documentazione

- **[`docs/stato-lavori.md`](docs/stato-lavori.md) — da leggere per primo se riprendi
  lo sviluppo dopo una pausa: cosa c’è, cosa manca, e le trappole già pagate**
- [`docs/architettura.md`](docs/architettura.md) — scelte tecniche e loro motivo
- [`docs/tracciabilita-requisiti.md`](docs/tracciabilita-requisiti.md) — matrice
  requisito → implementazione → stato, per il collaudo (§7 dell'analisi)
