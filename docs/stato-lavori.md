# Stato dei lavori — piattaforma Esperia

Documento di passaggio di consegne. Serve a riprendere lo sviluppo dopo una
pausa, senza dover ricostruire il contesto leggendo il codice.

**Ultimo aggiornamento:** 8 settembre 2026
**Riferimenti:** [analisi dei requisiti](Analisi_Requisiti_Esperia.docx) ·
[architettura](architettura.md) · [tracciabilità](tracciabilita-requisiti.md)

---

## 1. In una pagina

Esistono due applicazioni funzionanti, in un monorepo:

- **`apps/portal`** — Astro 7, il sito pubblico. Homepage, articolo, categoria,
  tag, ricerca, archivio, pagine di servizio, feed RSS, sitemap, redirect,
  banner cookie, commenti. Design del Committente applicati.
- **`apps/cms`** — Payload 3 su Next 16, il backoffice. Workflow editoriale,
  media library, ruoli, versioni, pubblicazione programmata, moderazione della
  community, strumenti dell'assistente AI. Design del Committente applicati.

Il database è uno solo, con **tre schemi che non si sovrappongono**: `payload`
(CMS), `public` (community con RLS), `ricerca` (indice full-text).

Il pezzo grosso ancora da fare è **uno**: il lavoro periodico che rileva gli hot
topic dalle fonti. Tutto il resto sono completamenti circoscritti.

---

## 2. Da zero a funzionante

```bash
pnpm install                       # richiede corepack enable

cp apps/cms/.env.example    apps/cms/.env
cp apps/portal/.env.example apps/portal/.env
# minimo indispensabile: DATABASE_URI e PAYLOAD_SECRET

pnpm dev:cms                       # 1° avvio: crea lo schema `payload`
psql "$DATABASE_URI" -f supabase/migrations/0001_community.sql
psql "$DATABASE_URI" -f supabase/migrations/0002_search_index.sql   # DOPO il punto sopra

pnpm --filter @esperia/cms seed        # amministratore, categorie, pagine legali
pnpm --filter @esperia/cms seed:demo   # contenuti finti (MAI in produzione)

pnpm dev                           # portale :4321 · backoffice :3001/admin
```

Credenziali del seed: `admin@esperia.local` / `esperia-cambiami-subito`.

> **L'ordine delle migrazioni conta.** `0002` legge `payload.articles`, che
> esiste solo dopo il primo avvio del CMS. Eseguirla prima fallisce.

### Provare la community in locale senza Supabase

I commenti passano da PostgREST, non da Postgres diretto. Per provarli senza un
progetto Supabase vero, si può montare PostgREST dietro un proxy che riscrive
`/rest/v1/` e toglie l'intestazione `Authorization` (PostgREST di prova non ha
un segreto JWT). Vale solo per lo sviluppo — la ricetta è nella cronologia dei
comandi, non l'abbiamo resa uno script perché non serve in produzione.

---

## 3. Che cosa è fatto

### Portale

| Area | Stato |
|---|---|
| Homepage, articolo, categoria, tag, ricerca, archivio, pagine di servizio, 404 | ✅ |
| SEO: canonical, Open Graph, Twitter Card, JSON-LD `NewsArticle`/`BreadcrumbList`/`WebSite`, sitemap, robots, redirect | ✅ |
| Ricerca full-text italiana con stemming, unaccent, ranking pesato ed evidenziazione dei termini | ✅ |
| Feed RSS generale e per categoria | ✅ |
| Banner cookie con consensi granulari; embed di terze parti caricati solo dopo consenso | ✅ |
| Commenti con risposte a un livello, "mi piace", segnalazioni | ✅ |
| Design consegnati (Home, Articolo, Listing, Ricerca v1) | ✅ |
| Versione dimostrativa statica, senza CMS né database (`MOCK=1`) | ✅ |

### Backoffice

| Area | Stato |
|---|---|
| Workflow editoriale con gate: nessuna pubblicazione senza approvazione | ✅ |
| Ruoli, versioni con ripristino, pubblicazione programmata, media library | ✅ (Payload) |
| Navigazione per flusso di lavoro con contatori delle code | ✅ |
| Dashboard a cinque code (miei pezzi, revisione, programmati, hot topic, moderazione) | ✅ |
| Coda di moderazione: approva/rifiuta/elimina, blocco utente, azioni di gruppo | ✅ |
| Hot topic: elenco con filtri, rilevanza, fonti, "genera bozza" | ✅ interfaccia |
| Genera da brief con accettazione elemento per elemento | ✅ |
| Registro operazioni immutabile | ✅ |
| Design consegnati (Pagine backoffice) | ✅ — vedi il limite dichiarato in [architettura §2.8](architettura.md) |

### Dati e sicurezza

| Area | Stato |
|---|---|
| Schema community con RLS su commenti, reazioni, segnalazioni, profili | ✅ |
| Profondità dei commenti imposta da trigger, non dall'interfaccia | ✅ |
| Campi amministrativi del profilo protetti da trigger che **solleva** invece di riallineare | ✅ |
| Chiavi API dei provider cifrate a riposo (AES-256-GCM), mai in chiaro dalle API | ✅ |
| Sanificazione del rich text in ingresso al portale (XSS stored) | ✅ |
| Header di sicurezza, anonimizzazione account (RF-C-07) | ✅ |

---

## 4. Che cosa resta

In ordine di dipendenza, non di importanza.

### 4.1 Ingestione fonti e ranking hot topic — RF-AI-01, RF-AI-02

**È il pezzo grosso.** Tutto il contorno esiste già:

- collection `sources` con cinque tipi di fonte, chiave cifrata, diagnostica
  (`lastFetchedAt`, `lastStatus`, `lastError`);
- collection `hot-topics` con cluster, fonti di riferimento, punteggio,
  `clusterKey` unico per non duplicare lo stesso argomento a ogni giro;
- parametri di rilevanza in `ai-settings` (ambiti, parole chiave da
  privilegiare o escludere, soglia minima, tetto per esecuzione);
- coda job di Payload già configurata (`jobs.autoRun`, cron al minuto);
- l'interfaccia che mostra tutto questo, già funzionante.

**Manca il job.** Da scrivere in `apps/cms/src/jobs/` con questa forma:

1. per ogni `source` attiva la cui `pollIntervalMinutes` è scaduta, interroga
   l'adattatore corrispondente al `type`;
2. normalizza le notizie in `{titolo, url, testata, dataPubblicazione}`;
3. raggruppa in cluster le notizie che parlano dello stesso fatto;
4. calcola il punteggio: **volume × freschezza × affinità con la linea
   editoriale**, con il `weight` della fonte come moltiplicatore;
5. scarta sotto `minScore`, tieni al massimo `maxTopicsPerRun`;
6. upsert su `clusterKey`; aggiorna `lastFetchedAt` / `lastStatus` sulla fonte.

Per il clustering, due strade: confronto per similarità di embedding (pgvector
è già disponibile in Supabase e servirebbe anche agli articoli correlati),
oppure una chiamata a `claude-haiku-4-5` che raggruppa un lotto di titoli. La
seconda è più semplice da avviare, la prima costa meno a regime.

> **Dipende dalla scelta delle fonti.** NewsAPI, GDELT e SerpAPI hanno costi,
> limiti e formati molto diversi, e sono a carico del Committente (V-02). È la
> prima cosa da chiudere al kick-off.

### 4.2 Pagine di accesso della community — RF-C-01, RF-C-02, RF-C-07

Da fare in `apps/portal/src/pages/`: `accedi`, `registrati`, `profilo`.
L'isola dei commenti già vi rimanda con il parametro `?ritorno=`.

Tutto il lato dati esiste: Supabase Auth con verifica email e reset password,
il trigger che crea il profilo alla registrazione (legge anche `full_name` e
`avatar_url` dei provider social, quindi RF-C-08 è quasi gratis), e le funzioni
`request_account_deletion()` e `anonymize_user()`.

Serve il modulo di richiesta cancellazione nel profilo, e un lavoro periodico
che esegua l'anonimizzazione sulle richieste registrate.

### 4.3 Assistenza all'editing — RF-AI-06

Diverso dalla generazione da zero, che è fatta: qui si lavora su un testo
esistente dentro l'editor. Riscrittura, sintesi, titoli alternativi,
suggerimenti SEO on-page.

Il posto giusto è un componente React nella colonna laterale dell'editor
(`admin.components` sul campo, o `beforeDocumentControls`). La logica riusa
`lib/ai/genera.ts` cambiando prompt e schema di output.

### 4.4 Completamenti minori

| Cosa | Dov'è già pronto | Cosa manca |
|---|---|---|
| Reazioni sugli articoli (RF-C-04) | tabella `reactions`, vista `reaction_counts`; funzionano sui commenti | interfaccia sulla pagina articolo |
| Regole anti-spam (RF-C-06) | colonne `auto_flagged` / `auto_flag_reason`, la coda le mostra | le regole che le valorizzano |
| Immagini assistite (RF-AI-07) | configurazione provider, dicitura obbligatoria | integrazione col provider |
| Statistiche (RF-B-14) | integrazione analytics configurabile | cruscotto in backoffice |
| Newsletter (RF-C-09) | — | tutto |

### 4.5 Prima del collaudo

- **Verificare il portale su un dispositivo mobile reale.** Il layout usa unità
  fluide con punto di rottura a 760px, ma non è stato guardato su un telefono:
  l'ambiente di sviluppo non lo permetteva. RF-P-08 è segnato 🟡 per questo.
  La versione dimostrativa (§9) è ora pubblicabile: aprirla dal telefono è il
  modo più rapido per chiudere questo punto.
- Testi legali (privacy e cookie policy) dal Committente — i contenitori
  esistono, sono vuoti.
- Dati della testata: registrazione al tribunale, partita IVA, direttore
  responsabile. Sono campi in Impostazioni portale, non costanti nel codice.
- Cambiare la password dell'amministratore creato dal seed.
- Configurare un adattatore email in Payload (ora scrive in console).

---

## 5. Trappole già pagate

Cose scoperte provando, non ipotizzando. Ognuna costerebbe mezza giornata a
riscoprirla.

**Astro trasmette in streaming.** Un header HTTP impostato durante il rendering
di un componente arriva a risposta già iniziata e viene **scartato senza
errori**. Tutta la politica di cache sta perciò in
`apps/portal/src/middleware.ts`, che gira prima del rendering. Non spostarla
nelle pagine.

**Payload cancella ciò che non riconosce.** In sviluppo sincronizza il proprio
schema con la configurazione: una colonna aggiunta a mano a `payload.articles`
viene proposta per l'eliminazione al riavvio successivo. Per questo l'indice di
ricerca vive nello schema separato `ricerca`, allineato da un hook applicativo
(`hooks/searchIndex.ts`). Se si disallinea: `select ricerca.ricostruisci();`.

**Le viste personalizzate di Payload nascono fuori dal template.** Una vista con
`path` proprio va avvolta in `DefaultTemplate` di `@payloadcms/next/templates`,
altrimenti compare a tutta pagina senza navigazione né barra superiore. Vedi le
tre viste in `components/views/`.

**Il config di Payload è in cache.** Modificare un endpoint o `payload.config.ts`
richiede il **riavvio** del server: l'hot reload non basta. I componenti React
invece si ricaricano normalmente. Dopo aver aggiunto un componente all'admin
serve anche `pnpm --filter @esperia/cms generate:importmap`.

**Una server action è un endpoint pubblico.** Il fatto che la richiami un
bottone non protegge nulla. Ogni azione in `components/views/*/azioni*.ts`
verifica sessione e ruolo da sé con `payload.auth()`.

**I global di Payload non esistono finché non li salvi.** Una `UPDATE` SQL su
`payload.ai_settings` non fa nulla se nessuno ha mai salvato quel global: la
riga non c'è. Usare `payload.updateGlobal()`.

**Una sola rotta on-demand rende server l'intera build di Astro.** Il tipo di
build si decide guardando le singole rotte: basta un `prerender = false` — ne
bastava uno in `/api/preview` — perché una build statica si fermi con
`NoAdapterInstalled`. Si corregge nell'hook `astro:route:setup`;
`astro:routes:resolved` non serve allo scopo, è di sola lettura e rimuovere voci
da lì non ha effetto.

**`<script is:inline>{`…`}</script>` non fa quello che sembra.** Con `is:inline`
Astro non valuta l'espressione: nell'HTML finiscono i delimitatori del template
literal, il browser esegue un blocco vuoto e **non compare alcun errore in
console**. Uno script che non parte e non si lamenta costa parecchio tempo. Se
serve JavaScript condizionale in pagina, tenerlo in un file e iniettarlo come
testo con `?raw` + `set:html`, come fa `mock/ricerca-cliente.js`.

**Il browser mostra copie in cache dell'admin.** Durante lo sviluppo può
mostrare un rendering vecchio dopo una modifica: sembra un bug che non c'è.
Prima di indagare, forzare un caricamento completo (`window.location.href`, non
la navigazione client).

---

## 6. Decisioni prese, da non rilitigare

Le motivazioni estese sono in [architettura.md](architettura.md); qui l'elenco
per non riaprirle senza un motivo nuovo.

| Decisione | In breve |
|---|---|
| Astro per il portale | Zero JS sulle pagine articolo: è l'asse su cui si viene collaudati (RF-P-07, RNF-01) |
| Payload per il backoffice | Il §3.3 dell'analisi è la feature list di un CMS. MIT, nessuna funzione a pagamento |
| Cache CDN, non ISR | L'hosting non è deciso (V-02): niente legami con una piattaforma |
| Community su Supabase, contenuti su Payload | RF-B-01 chiede la separazione; i commenti vanno protetti riga per riga da RLS |
| Ricerca in Postgres, non Meilisearch | Qualche migliaio di articoli in una lingua: un servizio in più non si ripaga |
| SDK Anthropic ufficiale | `claude-opus-5` per le bozze, `claude-haiku-4-5` per ranking e moderazione |
| Generazione AI in due tempi | Prima la proposta, poi la bozza: è ciò che rende reale la revisione umana di RF-AI-08 |
| Backoffice ri-tematizzato, non riscritto | Rifare elenco ed editor al pixel vorrebbe dire riscrivere versioni, permessi e validazioni |
| Niente tema scuro | I design definiscono una sola palette. Inventarne una seconda sarebbe design non concordato |
| Niente voce "profilazione" nel banner cookie | La monetizzazione è fuori perimetro (§6): dichiararla sarebbe descrivere un trattamento che non avviene |

---

## 7. Dove sta cosa

```
apps/cms/src/
  access/            chi può fare cosa (RF-B-02) — clausole Where, non controlli di interfaccia
  collections/       il modello dati: Articles è il cuore
  globals/           SiteSettings (portale), AiSettings (assistente)
  hooks/             enforceWorkflow ← il gate di RF-B-05 · searchIndex · revalidatePortal · auditLog
  fields/            slug, SEO, campo cifrato
  endpoints/         search (FTS con ranking) · generaBozza (REST)
  lib/ai/            client (chiavi, degrado) · genera (prompt e schema) · creaBozza
  lib/supabase.ts    ⚠ confine col mondo community: sola chiave di servizio, solo server
  components/        nav, dashboard, pastiglia, e le tre viste personalizzate
  app/(payload)/custom.scss   ← il tema del backoffice: cambiare qui, non nei componenti

apps/portal/src/
  styles/tokens.css  ← il design del portale: cambiare qui, non nei componenti
  lib/types.ts       il contratto HTTP col CMS, scritto a mano di proposito
  lib/payload.ts     lettura dal CMS, con cache di processo e degrado
  lib/lexical-render.ts   ⚠ punto di sanificazione: qui si previene la XSS stored
  middleware.ts      redirect, manutenzione, cache, header di sicurezza
  components/islands/     le uniche parti che arrivano al browser

supabase/migrations/
  0001_community.sql community + RLS + trigger
  0002_search_index.sql   schema `ricerca` — DOPO il primo avvio del CMS

packages/shared/     ruoli, workflow, stati, tipi community — usato da entrambe le app
```

---

## 8. Aperto col Committente

| Tema | Perché blocca |
|---|---|
| **Fonti news e trend** | Blocca il §4.1, cioè l'unico pezzo grosso rimasto. Costi a carico del Committente (V-02) |
| **Hosting** | Finora tutto è portabile (Astro standalone, CMS `output: standalone`, Postgres puro). Deciderlo permette di ottimizzare |
| **Region dei dati** | Supabase e storage in UE per RNF-04 |
| **Testi legali** | Privacy e cookie policy: forniti dal Committente, i contenitori esistono |
| **Priorità Should/Could** | Con V-01 a due mesi, l'analisi stessa prevede di consolidarle in kick-off. Vale la pena usarla davvero |

---

## 9. Versione dimostrativa

Serve a mettere il portale davanti al Committente **prima** che il CMS sia
popolato e prima che l'hosting sia deciso, per raccogliere i primi riscontri.

```bash
pnpm --filter @esperia/portal build:demo     # genera apps/portal/dist
pnpm --filter @esperia/portal preview:demo   # lo serve su :4321
```

Con `MOCK=1` i contenuti arrivano dalle fixture in `apps/portal/src/mock/`, la
build diventa statica e si pubblica su Render come sito statico — gratuito, su
CDN, senza spegnimenti. Il blueprint è `render.yaml`: su Render, *New →
Blueprint*, si punta al repository e si conferma.

**Perché statico e non un servizio web:** il piano gratuito dei servizi web
spegne l'istanza dopo quindici minuti di inattività, e il primo che apre il link
aspetta quasi un minuto. Per un link che si manda al Committente è inaccettabile.

**Come è fatto.** L'intercettazione è una sola, dentro `lib/payload.ts`: si
sostituisce `get<T>()`, cioè il trasporto HTTP verso Payload. Tutto il resto —
filtri, impaginazione, ordinamento, articoli correlati, SEO, RSS, sitemap —
resta il codice di produzione, così ciò che il Committente giudica è davvero il
portale che andrà online.

**I contenuti sono inventati**, e il sito è pubblicamente raggiungibile. Le
difese sono tre e vanno mantenute: `robots.txt` risponde `Disallow: /`, Render
aggiunge `X-Robots-Tag: noindex`, e una fascia in cima a ogni pagina dichiara
che si tratta di una dimostrazione. I testi citano istituzioni e ruoli, mai
persone reali per nome.

**Le immagini non sono fotografie.** Le quattro in `Design portale Esperia/
uploads` non erano utilizzabili: tre ritraggono politici reali e identificabili,
la quarta è lo screenshot del sito di qualcun altro. Una foto vera accanto a una
notizia inventata la fa sembrare autentica. Al loro posto ci sono composizioni
astratte generate nella palette del progetto. Se il Committente vuole fotografie
nella dimostrazione deve fornirle con licenza d'uso: si sostituiscono i file in
`public/mock/media/` mantenendo i nomi.

Differenze note rispetto al portale vero (ricerca, impaginazione, commenti) e
trappole incontrate: **[`apps/portal/src/mock/README.md`](../apps/portal/src/mock/README.md)**.

Nel farlo sono state chiuse due lacune che riguardano anche il portale reale:
`/accedi` e `/registrati` erano collegate dalla testata ma non esistevano, e
portavano a due 404; ora ci sono due segnaposto che dichiarano la lavorazione in
corso, da sostituire con le pagine vere quando si affronta il §4.2.
