# Stato dei lavori — piattaforma Esperia

Documento di passaggio di consegne. Serve a riprendere lo sviluppo dopo una
pausa, senza dover ricostruire il contesto leggendo il codice.

**Ultimo aggiornamento:** 5 ottobre 2026
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
(CMS), `esperia` (community con RLS), `ricerca` (indice full-text). La community
non sta in `public` perché il progetto Supabase può essere condiviso con altre
applicazioni: in prova lo è, con moonbrand.

Tutti i requisiti Must sono implementati. Area utente, assistente AI, immagini
con Gemini, rilevamento degli hot topic e regole anti-spam sono provati contro i
servizi veri (Supabase, Anthropic, Gemini, feed RSS). Restano: la prova delle
pagine dell'area utente nel browser, gli adattatori delle fonti a pagamento
(attendono la scelta del Committente), due Could (statistiche, newsletter), una
decisione di design (reazioni sugli articoli) e le attività prima del collaudo.
Il piano è al §4.

---

## 2. Da zero a funzionante

```bash
pnpm install                       # richiede corepack enable

cp apps/cms/.env.example    apps/cms/.env
cp apps/portal/.env.example apps/portal/.env
# minimo indispensabile: DATABASE_URI e PAYLOAD_SECRET

pnpm dev:cms                       # 1° avvio: crea lo schema `payload`
psql "$DATABASE_URI" -f supabase/migrations/0002_search_index.sql   # DOPO il punto sopra

# community (0001, 0003, 0004) nello schema `esperia`, anche su un database
# diverso da quello di Payload: connessione in ESPERIA_COMMUNITY_DB_URL
pnpm --filter @esperia/cms community:migra             # controlla soltanto
pnpm --filter @esperia/cms community:migra --applica   # applica, in una transazione

pnpm --filter @esperia/cms seed        # amministratore, categorie, pagine legali
pnpm --filter @esperia/cms seed:demo   # contenuti finti (MAI in produzione)

pnpm dev                           # portale :4321 · backoffice :3001/admin
```

Credenziali del seed: `admin@esperia.local` / `esperia-cambiami-subito`.

> **L'ordine delle migrazioni conta.** `0002` legge `payload.articles`, che
> esiste solo dopo il primo avvio del CMS. Eseguirla prima fallisce.

### Impostazioni del progetto Supabase per l'area utente

**Dopo** `community:migra --applica`, mai prima: Settings → API → *Exposed
schemas*, aggiungere `esperia`. PostgREST va in errore se gli si chiede uno
schema che non esiste, e su un progetto condiviso fermerebbe anche l'API
dell'altra applicazione.

Nel pannello di Supabase, sezione Authentication:

- **URL Configuration**: *Site URL* uguale a `PUBLIC_SITE_URL`, e fra i
  *Redirect URLs* `<sito>/accedi` e `<sito>/nuova-password` (o `<sito>/**`).
  Senza, i link di conferma e di recupero nelle email portano alla home.
- **Policies**: lunghezza minima della password **8**, come il portale. Il
  controllo del portale da solo non basta: Supabase si chiama anche direttamente.
- **Email**: conferma dell'indirizzo attiva, e un SMTP vero prima del collaudo.
  Quello predefinito di Supabase invia pochissime email l'ora.

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
| Area utente: registrazione, accesso, recupero password, profilo, cancellazione account | ✅ dati e API provati su Supabase vero; pagine non ancora provate nel browser (§4.2) |
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
| Hot topic: elenco con filtri, rilevanza, fonti, "genera bozza" | ✅ |
| Rilevamento hot topic: lettura fonti RSS / Atom, raggruppamento, punteggio, decadimento | ✅ (§4.1) |
| Bozza AI da appunti o hot topic, dalla finestra «Nuovo articolo»: si apre subito nell'editor con la lista «Prima di inviare», che blocca il passaggio In revisione finché non è chiusa | ✅ |
| Assistente AI nell'editor: riscrivi, sintetizza, titoli alternativi, suggerimenti SEO | ✅ provato con l'API Anthropic vera (§4.3) |
| Immagini assistite con Google Gemini: proposte, scelta, copertina con dicitura | ✅ provato con Gemini vero (§4.3) |
| Termini anti-spam gestiti in Impostazioni portale → Community | ✅ (§4.4) |
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

### Piano dei prossimi passi

In ordine di priorità. I dettagli sono nelle sezioni che seguono.

| # | Cosa | Dipende da | Stato |
|---|---|---|---|
| 1 | Provare nel browser le pagine dell'area utente: registrazione con email di conferma, accesso, recupero password, profilo, cancellazione (§4.2) | un SMTP sul progetto Supabase di prova (quello predefinito invia 2 email l'ora e solo ai membri del team) | ambiente pronto, prova da fare |
| 2 | Migrazioni di Payload per la produzione: oggi lo schema si allinea solo in sviluppo, e la cartella `migrations/` è vuota (§4.5) | — | da fare prima del primo deploy |
| 3 | Adattatori NewsAPI, GDELT, SerpAPI (§4.1) | scelta delle fonti del Committente (§8) | in attesa |
| 4 | Reazioni sugli articoli (RF-C-04, §4.4) | una decisione di design: Articolo v1 non le prevede | in attesa |
| 5 | Statistiche in backoffice (RF-B-14, Could) | priorità da confermare al kick-off | da fare |
| 6 | Newsletter (RF-C-09, Could) | priorità e fornitore da confermare | da fare |
| 7 | Attività prima del collaudo (§4.5) | in parte dal Committente | aperte |

Fatto in questo ciclo, provato contro i servizi veri: rilevamento hot topic da
RSS (§4.1), area utente e cancellazione account a livello di dati e API (§4.2),
assistente all'editing e immagini con Gemini (§4.3), regole anti-spam (§4.4),
community nello schema `esperia` su un progetto Supabase condiviso, barra
«Ultim'ora» nel portale (§6).

### 4.1 Ingestione fonti e ranking hot topic — RF-AI-01, RF-AI-02

**Fatto per le fonti RSS / Atom.** Il job `rileva-hot-topic`
(`apps/cms/src/jobs/`) gira ogni cinque minuti e, per ogni giro:

1. interroga le `sources` attive la cui `pollIntervalMinutes` è scaduta;
2. salva le notizie nuove in `news-items` (una per URL, finestra di 48 ore,
   conservate sette giorni) e scrive `lastFetchedAt` / `lastStatus` /
   `lastError` sulla fonte;
3. raggruppa **tutte** le notizie della finestra, non solo quelle appena lette:
   è così che due testate uscite a ore di distanza si incontrano;
4. assegna il punteggio: volume (testate distinte) × freschezza (dimezza ogni
   12 ore) × affinità con ambiti e parole chiave di Impostazioni AI × `weight`
   medio delle fonti;
5. aggiorna gli argomenti già proposti, crea i nuovi sopra `minScore` fino a
   `maxTopicsPerRun`; non tocca mai quelli scartati o convertiti;
6. ricalcola il punteggio degli argomenti che non ricevono più notizie, così
   un fatto di tre giorni fa scende in fondo all'elenco.

Il raggruppamento è lessicale, senza AI: titoli ridotti a radici, pesate per
rarità nella finestra. Costa zero per esecuzione e funziona con il modulo AI
spento — ma l'interruttore generale di Impostazioni AI ferma comunque il job.
Le soglie sono tarate su feed nazionali reali; per ritararle su fonti locali:

```bash
pnpm --filter @esperia/cms prova:hot-topic <feed> [<feed>...] --temi "..." --privilegia "..." --tutti
```

legge i feed, raggruppa e stampa gruppi e punteggi senza toccare il database.

**Diagnostica in scheda fonte:** errori di rete in chiaro (dominio inesistente,
timeout, HTTP 404…), feed vuoto, feed fermo da più di sette giorni, tipo di
fonte non ancora supportato.

**Resta da fare:**

- adattatori NewsAPI, GDELT, SerpAPI, endpoint personalizzato — uno per tipo,
  in `lib/fonti/`, registrato in `ADATTATORI`. Dipendono dalla scelta delle
  fonti (V-02), che resta la prima cosa da chiudere al kick-off;
- sintesi e categoria suggerita: oggi la sintesi è l'estratto della notizia più
  rappresentativa e la categoria resta vuota. Una chiamata a `utilityModel` per
  argomento nuovo le scriverebbe meglio, con costo registrato in `ai-usage`;
- se il raggruppamento lessicale si rivelasse insufficiente su fonti locali, la
  strada è la similarità di embedding con pgvector (servirebbe anche agli
  articoli correlati).

### 4.2 Pagine di accesso della community — RF-C-01, RF-C-02, RF-C-07

**Scritte, non ancora provate con un Supabase vero.** Cinque pagine in
`apps/portal/src/pages/` (`accedi`, `registrati`, `recupera-password`,
`nuova-password`, `profilo`), ognuna con un'isola in
`components/islands/account/` che parla direttamente con Supabase Auth, come
fanno i commenti. La cornice comune è `components/AreaUtente.astro`. I design
non comprendono queste schermate: sono composte con i token e gli elementi già
presenti nel portale.

- **Registrazione:** nome pubblico, email, password di almeno 8 caratteri,
  consenso all'informativa. Il nome viaggia nei metadati e lo legge il trigger
  `handle_new_user`. Il messaggio dopo l'invio è lo stesso anche per un'email già
  registrata, così non si scopre chi è iscritto.
- **Accesso:** chi ha già una sessione viene portato subito a destinazione. Il
  link di conferma email riporta su `/accedi`, che apre la sessione e prosegue.
  `?ritorno=` accetta solo percorsi interni (niente redirect verso altri siti).
- **Profilo:** nome e biografia, cambio password, uscita, avviso se la
  moderazione ha sospeso i commenti.
- **Cancellazione (RF-C-07):** il pulsante chiama `request_account_deletion()`
  e chiude la sessione. Il job `anonimizza-account` del CMS gira ogni ora ed
  esegue `anonymize_user()` con la chiave di servizio. Al lettore promettiamo
  "entro 24 ore". La migrazione `0003` rende esplicito il permesso di
  esecuzione per `service_role`.

La testata resta uguale per tutti e senza JavaScript (RNF-01): continua a
mostrare "Accedi / Registrati" anche a chi è già dentro, e `/accedi` lo
rimanda al profilo.

Nella versione dimostrativa le pagine dicono che l'area riservata non è
collegata.

**Provato su un progetto Supabase vero** il 5 ottobre 2026 (progetto di prova
condiviso con moonbrand, schema `esperia`, migrazioni applicate con
`community:migra --applica` tramite Management API): profilo creato dal trigger
solo per gli utenti del portale, profilo al primo accesso per un account
esterno, commenti con RLS e anti-spam, moderazione e termini dal CMS,
cancellazione che elimina l'account esperia e conserva quello esterno. Gli
utenti di prova sono stati creati con l'API di amministrazione (nessuna email
reale inviata) e rimossi a fine prova.

**Resta da fare:** provare le pagine nel browser, comprese le email di conferma
e recupero password (servono un SMTP e gli URL di reindirizzamento del
progetto); il cambio email dal profilo; il login social (RF-C-08), per cui il
trigger è già pronto.

### 4.3 Assistenza all'editing — RF-AI-06

**Fatta seguendo il design (Editor v1, blocco "Assistente AI") e provata contro
l'API vera** il 5 ottobre 2026, su un articolo di prova: da 2 a 8 secondi per
strumento, circa 1 centesimo a chiamata col modello per i testi. Il pannello sta nella colonna laterale dell'editor
articolo: quattro strumenti (Riscrivi, Sintetizza, Titoli alternativi,
Suggerimenti SEO), proposta accanto al testo attuale, "Accetta e sostituisci" /
"Rifiuta". Con l'AI spenta il pannello resta e dice perché (RNF-10).

- Riscrivi e Sintetizza agiscono sulla selezione nel corpo, o sul primo
  paragrafo se non c'è selezione. Riscrittura, sintesi e SEO usano il modello per
  i testi, i titoli il modello di servizio. La SEO è passata al modello per i
  testi dopo la prova: con Haiku metà dei suggerimenti era falsa (segnalava
  come mancante ciò che l'attacco conteneva).
- "Accetta" scrive nell'editor aperto, non nel database: la modifica va riletta
  e salvata come le altre, con le versioni di Payload a fare da rete. Se nel
  frattempo il passaggio è cambiato, la proposta viene rifiutata invece di
  sovrascrivere il lavoro del redattore. Questa logica (`components/assistente/corpo.ts`)
  è provata su un editor Lexical senza interfaccia.
- Il pannello raggiunge l'editor tramite una feature Lexical che non disegna
  nulla (`PonteAssistenteFeature`): registra editor e selezione in
  `ponteEditor.ts`, da cui il pannello li legge. Il pannello sta fuori
  dall'albero React dell'editor e non può usare un contesto.
- Ogni chiamata finisce nel registro consumi (`rewrite`, `summarize`,
  `title_suggestions`, `seo_suggestions`).

Corretto nello stesso giro: con Haiku scelto come modello per i testi, le bozze
fallivano, perché Haiku 4.5 non accetta `effort` né il thinking adattivo.
`parametriRagionamento()` in `lib/ai/client.ts` li passa solo ai modelli che li
supportano.

**Immagini assistite (RF-AI-07), stesso pannello, fornitore Google Gemini**
(scelto dal Committente). Il redattore descrive l'immagine. Gemini genera le
proposte (4 per impostazione, una richiesta e una fattura ciascuna; nessun piano
gratuito per le immagini) e il redattore ne sceglie una come copertina.

- Endpoint: Interactions API (`v1beta/interactions`), `store: false`, formato
  16:9 a 1K (1376×768: Payload non crea la variante `hero` da 1600 px e il
  portale usa l'originale, più largo della colonna dell'articolo). Ogni immagine
  di Gemini porta il watermark invisibile SynthID.
- La descrizione del redattore viaggia dentro una cornice fissa: niente persone
  reali riconoscibili, niente scritte, loghi o marchi (`lib/ai/immagini.ts`).
- Le proposte restano nel browser. Solo quella scelta entra nella media library
  (`salvaCopertina`), con `aiGenerated` impostato dal sistema. Un hook su Media
  rimette la dicitura nei crediti se qualcuno la toglie, e il campo non è
  modificabile dai redattori. Provato su database vero.
- Configurazione in Impostazioni AI → Immagini: provider, chiave cifrata (o
  `GEMINI_API_KEY`), modello (Flash, Flash Lite, Pro), numero di proposte,
  formato, listino per la stima dei costi nel registro consumi.
- Il limite delle server action è alzato a 15 MB (`next.config.mjs`): la
  copertina scelta torna al server in base64 e supera il limite predefinito di 1 MB.

Attenzione al deploy: le opzioni del provider sono ora "Nessuno" e "Google
Gemini". Un database in cui qualcuno avesse salvato OpenAI, Stability o
Replicate va riportato a "Nessuno" prima, altrimenti l'allineamento dello
schema fallisce.

**Provato con Gemini vero:** una generazione con `gemini-3.1-flash-image` ha
restituito una JPEG 1376×768 conforme ai vincoli (nessuna persona, scritta o
logo). Salvata nella media library è diventata un WebP da 168 KB con le
varianti thumbnail, card e og, dicitura nei crediti e `aiGenerated` impostato.
La stessa prova ha mostrato che il listino immagini in Impostazioni AI resta
vuoto sulle installazioni esistenti (Payload applica i valori predefiniti di
un array solo alla creazione del global) e il costo risultava 0 €: ora c'è un
listino di riserva nel codice.

### 4.4 Completamenti minori

| Cosa | Dov'è già pronto | Cosa manca |
|---|---|---|
| Reazioni sugli articoli (RF-C-04) | tabella `reactions`, vista `reaction_counts`; funzionano sui commenti | **una decisione di design**: la pagina Articolo v1 non le prevede, e aggiungerle vorrebbe dire inventare un pezzo di pagina |
| Statistiche (RF-B-14) | integrazione analytics configurabile | cruscotto in backoffice |
| Newsletter (RF-C-09) | — | tutto |

**Regole anti-spam (RF-C-06): fatte.** Un trigger in `0004_antispam.sql`
segnala in coda, senza bloccarli: troppi link, link da un account nato da meno
di un giorno, testo già inviato, raffiche, tutto maiuscolo, caratteri ripetuti,
termini scelti dalla redazione. Rifiuta solo oltre 10 commenti in 10 minuti
(`PT429`, HTTP 429, con un messaggio dedicato nel portale). I termini si
gestiscono in Impostazioni portale → Community: il campo è leggibile solo dalla
redazione e il salvataggio li sincronizza su Supabase prima di registrarli.
Provato regola per regola sul Supabase locale.

Nello stesso giro il pannello di segnalazione ha ricevuto la "Nota per la
moderazione (facoltativa)" che il design prevedeva e che mancava.

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
- **Migrazioni di Payload.** In sviluppo Payload allinea da solo lo schema; in
  produzione no, e `migrations/` è vuota. Prima del primo deploy vanno generate
  (`pnpm --filter @esperia/cms migrate:create`): fra le tabelle nuove ci sono
  `news-items` e quella interna dello scheduler dei job.
- **Progetto Supabase di produzione dedicato, intestato al Committente.** Quello
  di prova è condiviso con altre applicazioni: lo schema `esperia` separa le
  tabelle, ma utenti, email e impostazioni di accesso restano comuni (RNF-04).
- Sul progetto Supabase di produzione: password minima 8, conferma email, SMTP
  vero, URL del sito e di reindirizzamento del portale (§2).
- Togliere `SUPABASE_ACCESS_TOKEN` da `apps/cms/.env` quando non serve più: è un
  token personale valido per tutti i progetti dell'account, condiviso con un
  altro progetto, e serviva solo ad applicare le migrazioni di prova.

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

**PostgREST ricarica la configurazione, non le tabelle.** Dopo aver esposto uno
schema con `pgrst.db_schemas` serve anche `notify pgrst, 'reload schema'`,
altrimenti le tabelle risultano inesistenti (PGRST205) pur essendoci.
`community:migra` lo invia a fine migrazione; il pannello di Supabase lo fa da
solo quando si cambiano gli schemi esposti.

**Gli utenti di Supabase sono del progetto, non dello schema.** Su un progetto
condiviso il trigger crea il profilo solo per chi si registra dal portale
(`app: 'esperia'` nei metadati), `assicura_profilo()` lo crea al primo accesso
per chi arriva con un account esistente, e la cancellazione elimina l'account
di accesso solo se è nato da esperia. Provato con un utente "esterno" accanto a
uno di esperia.

**I valori predefiniti degli array di Payload valgono solo alla creazione.** Un
campo array aggiunto a un global già salvato resta vuoto: il listino immagini
stimava 0 € per questo. Per valori indispensabili serve un ripiego nel codice.

**Togliere un'opzione da un campo select rompe lo schema.** Se un database ha
salvato quel valore, Payload non riesce più ad allineare l'enum e il CMS non
parte. Le opzioni si aggiungono; per toglierle bisogna prima riportare i dati.

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
| SDK Anthropic ufficiale | Modello per i testi (`claude-opus-5`) per bozze, riscrittura, sintesi e SEO; modello di servizio (`claude-haiku-4-5`) per i titoli alternativi. La SEO è passata al modello per i testi dopo la prova reale |
| Hot topic senza AI | Raggruppamento lessicale e punteggio calcolato: costo zero per giro, funziona con il modulo AI spento (RNF-10) |
| Immagini con Google Gemini | Scelta del Committente. Dicitura nei crediti imposta da un hook, `aiGenerated` non modificabile dai redattori |
| Community nello schema `esperia` | Convive con altre applicazioni sullo stesso progetto Supabase; per la produzione resta consigliato un progetto dedicato (§4.5) |
| Barra «Ultim'ora» nel portale | Decisa il 5 ottobre 2026: non è nei design consegnati, la demo tiene «In evidenza» |
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
  jobs/              rilevaHotTopic · anonimizzaAccount — i job periodici
  lib/ai/            client (chiavi, degrado) · genera (prompt e schema) · creaBozza · assistenza (RF-AI-06) · immagini (RF-AI-07, Gemini)
  components/assistente/  pannello dell'editor, ponte verso Lexical, azioni
  lib/fonti/         un adattatore per tipo di fonte (per ora RSS / Atom)
  lib/hotTopic/      testo · cluster · punteggio (logica pura) · rileva (il giro) · prova
  lib/supabase.ts    ⚠ confine col mondo community: sola chiave di servizio, solo server
  components/        nav, dashboard, pastiglia, e le tre viste personalizzate
  app/(payload)/custom.scss   ← il tema del backoffice: cambiare qui, non nei componenti

apps/portal/src/
  styles/tokens.css  ← il design del portale: cambiare qui, non nei componenti
  lib/types.ts       il contratto HTTP col CMS, scritto a mano di proposito
  lib/payload.ts     lettura dal CMS, con cache di processo e degrado
  lib/lexical-render.ts   ⚠ punto di sanificazione: qui si previene la XSS stored
  lib/account.ts     area utente: ritorno sicuro, messaggi d'errore di Supabase Auth
  middleware.ts      redirect, manutenzione, cache, header di sicurezza
  components/islands/     le uniche parti che arrivano al browser (account/ = area utente)

supabase/migrations/
  0001_community.sql community + RLS + trigger
  0002_search_index.sql   schema `ricerca` — DOPO il primo avvio del CMS
  0003_cancellazione_account.sql   permesso del job di cancellazione (RF-C-07)
  0004_antispam.sql   regole anti-spam e termini della redazione (RF-C-06)

packages/shared/     ruoli, workflow, stati, tipi community — usato da entrambe le app
```

---

## 8. Aperto col Committente

| Tema | Perché blocca |
|---|---|
| **Fonti news e trend** | RSS funziona già; NewsAPI, GDELT e SerpAPI aspettano questa scelta (§4.1). Costi a carico del Committente (V-02) |
| **Hosting** | Finora tutto è portabile (Astro standalone, CMS `output: standalone`, Postgres puro). Deciderlo permette di ottimizzare |
| **Region dei dati** | Supabase e storage in UE per RNF-04 |
| **Testi legali** | Privacy e cookie policy: forniti dal Committente, i contenitori esistono |
| **Priorità Should/Could** | Con V-01 a due mesi, l'analisi stessa prevede di consolidarle in kick-off. Vale la pena usarla davvero |
| **Progetto Supabase di produzione** | Va intestato al Committente: utenti, email di accesso e dati personali non possono stare in un progetto condiviso con altri clienti (RNF-04) |
| **Reazioni sugli articoli** | RF-C-04 è Should, ma la pagina Articolo v1 non le prevede: serve una decisione di design prima di implementarle |
| **Barra «Ultim'ora»** | Accesa nel portale ma assente dai design: da confermare col Committente |

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
aggiunge `X-Robots-Tag: noindex`, e il piede — con le pagine di servizio —
dichiara la versione dimostrativa. I testi citano istituzioni e ruoli, mai
persone reali per nome, e le fotografie non ritraggono persone identificabili.

La barra dei titoli sa intercalare un cartello «contenuti di esempio» ma non lo
fa: la dimostrazione serve a far valutare il design, e un avviso ricorrente
lavora contro quello scopo. Si riaccende passando `avviso` a `BarraTitoli` in
`Base.astro`, se l'indirizzo dovesse circolare più del previsto. Nella demo
l'etichetta è «In evidenza»; nel portale vero la barra è accesa con «Ultim'ora».

**Le fotografie vengono da Wikimedia Commons**, unico archivio che dia insieme
licenza verificabile e origine citabile via API. Autore e licenza sono nel campo
crediti, mostrato sotto la foto nell'articolo: è lì che le licenze CC BY e
CC BY-SA ottengono l'attribuzione che richiedono, e quella riga non va tolta dal
design. Il criterio di scelta è sostanziale, non estetico: niente persone reali
identificabili, niente marchi accostati a notizie che riguardano altri, niente
scritte che smentiscano il pezzo; e se non esiste una foto adatta, l'articolo
resta senza. Le quattro immagini in `Design portale Esperia/uploads` non erano
utilizzabili — tre ritraggono politici reali, la quarta è lo screenshot del sito
di qualcun altro. Per sostituirle con materiale del Committente si rimpiazzano i
file in `public/mock/media/` mantenendo i nomi e si aggiorna `copertine.ts`.

Differenze note rispetto al portale vero (ricerca, impaginazione, commenti) e
trappole incontrate: **[`apps/portal/src/mock/README.md`](../apps/portal/src/mock/README.md)**.

Le pagine dell'area utente (§4.2) esistono anche qui, ma senza Supabase non
hanno nulla a cui collegarsi: al posto del modulo dicono che nella versione
dimostrativa l'area riservata non è collegata.
