# Architettura tecnica — piattaforma Esperia

Versione 0.1 · documento di lavoro per il kick-off
Riferimento: *Analisi dei Requisiti — Piattaforma Esperia*, v0.1

---

## 1. Quadro d'insieme

```
                     ┌────────────────────────────┐
   Lettori  ────────▶│  PORTALE  (Astro 7, SSR)   │
                     │  zero JS sulle pagine       │
                     │  articolo; isole per        │
                     │  commenti e consensi        │
                     └───────┬─────────────┬───────┘
                             │ HTTP        │ RLS
                             │ (lettura)   │
                     ┌───────▼──────┐   ┌──▼──────────────┐
   Redazione ───────▶│  CMS         │   │  Supabase       │
                     │  Payload 3   │   │  Auth + Storage │
                     │  su Next 16  │   │  schema public  │
                     └───────┬──────┘   └──┬──────────────┘
                             │              │
                     ┌───────▼──────────────▼───────┐
                     │  PostgreSQL                  │
                     │  payload.*  CMS              │
                     │  public.*   community + RLS  │
                     │  ricerca.*  indice full-text │
                     └──────────────────────────────┘
                             │
                     ┌───────▼──────┐
                     │  Anthropic   │  a consumo, chiavi del Committente (V-02)
                     └──────────────┘
```

Due applicazioni deployabili separatamente, un solo database con tre schemi
che non si sovrappongono.

---

## 2. Le decisioni, e perché

### 2.1 Astro per il portale, non Next né Angular

Il documento pone SEO tecnica (RF-P-07) e prestazioni (RNF-01) fra i requisiti
verificati al collaudo (§7). Su una pagina articolo — che è testo — Astro
spedisce HTML e nient'altro: il framework non arriva nel browser. È il vantaggio
strutturale più grande disponibile su quell'asse.

Angular avrebbe richiesto di ricostruire a mano ciò che qui è gratuito
(rigenerazione incrementale, ottimizzazione immagini, metadati per rotta), e
avrebbe comunque spedito il framework su ogni pagina.

**Costo accettato:** il portale è in un ecosistema diverso dal backoffice. Il
confine è però netto — un contratto HTTP, dichiarato in
`apps/portal/src/lib/types.ts` — e i due lati condividono i tipi di dominio via
`packages/shared`.

### 2.2 Payload come CMS, non sviluppo da zero

Il §3.3 dell'analisi (RF-B-01…14) è la lista delle funzioni di un CMS: ruoli,
workflow, versioni con ripristino, pubblicazione programmata, media library con
ridimensionamento, editor ricco con anteprima. Riscriverle avrebbe assorbito una
frazione rilevante dei due mesi di V-01 senza aggiungere nulla di distintivo.

Payload è MIT (nessuna funzione dietro un piano a pagamento, rilevante vista la
titolarità sospesa di V-06), gira su Postgres, e la sua interfaccia è estendibile
in React — il che rende innestabile il pannello AI dentro l'editor invece che in
una schermata separata.

**Costo accettato:** una dipendenza importante da conoscere. In cambio, dieci
requisiti Must già coperti.

### 2.3 Cache CDN, non rigenerazione incrementale

L'hosting non è deciso (V-02: infrastruttura a carico del Committente). Legarsi
all'ISR di una piattaforma specifica avrebbe significato riscrivere la strategia
di caching al momento della scelta.

Il portale dichiara invece `Cache-Control: s-maxage + stale-while-revalidate` e
il CMS chiama `/api/revalidate` alla pubblicazione. Funziona identico su Vercel,
Netlify, Cloudflare o Nginx davanti a un container Node.

> **Attenzione, verificato sul campo:** Astro trasmette la risposta in streaming.
> Un header impostato durante il rendering di un componente arriva a risposta già
> iniziata e viene **scartato senza errori**. La politica di cache sta perciò in
> `apps/portal/src/middleware.ts`, che gira prima del rendering. Non spostarla
> nelle pagine.

### 2.4 Community su Supabase, contenuti su Payload

RF-B-01 chiede esplicitamente che l'accesso al backoffice sia separato da quello
della community. La separazione qui non è una convenzione ma un confine reale:

| | Community | Backoffice |
|---|---|---|
| Identità | Supabase Auth (`auth.users`) | collection `users` di Payload |
| Dati | schema `public`, protetto da RLS | schema `payload` |
| Scritture | dal browser, con chiave anon | dal server, con sessione staff |
| Regole | policy nel database | access control nel codice |

I commenti sono ad alta frequenza di scrittura e vanno protetti riga per riga:
RLS applica le regole nel database, quindi valgono anche se il portale venisse
riscritto. I contenuti editoriali sono a bassa frequenza e ad alto valore
redazionale: stanno dove c'è il workflow.

**Conseguenza affrontata:** la coda di moderazione (RF-B-10) vive nel
backoffice ma legge dati in Supabase. È una vista personalizzata di Payload che
interroga Supabase con la chiave di servizio (`apps/cms/src/lib/supabase.ts`) e
ricongiunge i commenti agli articoli, che stanno nell'altro schema. Il costo di
questa scelta è tutto qui: un file di confine, esplicito e leggibile.

### 2.5 Ricerca in uno schema separato

Payload sincronizza il proprio schema con la configurazione e rimuove ciò che non
riconosce. Una colonna `tsvector` aggiunta a `payload.articles` viene proposta
per l'eliminazione al primo avvio successivo — **verificato sul campo durante lo
sviluppo, non ipotizzato.**

L'indice vive quindi nello schema `ricerca`, che Payload non tocca, allineato da
un hook applicativo (`apps/cms/src/hooks/searchIndex.ts`) invece che da un
trigger: la sincronizzazione è visibile nel codice, testabile, e non dipende da
oggetti di database che una migrazione futura potrebbe far sparire in silenzio.

`select ricerca.ricostruisci();` riallinea tutto leggendo la sorgente di verità.

### 2.6 Modelli AI

SDK ufficiale Anthropic. Configurazione da backoffice (RF-AI-09), chiavi cifrate
a riposo con AES-256-GCM, mai restituite in chiaro dalle API.

| Uso | Modello | Motivo |
|---|---|---|
| Generazione bozze | `claude-opus-5` | è il testo che il redattore dovrà correggere: la qualità qui si ripaga |
| Ranking, clustering, moderazione | `claude-haiku-4-5` | alto volume, compiti semplici |

Il costo stimato di ogni chiamata finisce nella collection `ai-usage` (RF-AI-10).
Fa fede la fattura del provider: quella tabella serve a sapere *chi* ha speso e
*per cosa*, informazione che la fattura non dà.

### 2.7 Il design è dato, non interpretato

I valori visivi sono estratti dalle tavole consegnate e vivono tutti in
`tokens.css`. Dove i design lasciavano una scelta aperta l'abbiamo risolta
esplicitamente, e vale la pena che sia agli atti:

| Punto | Decisione | Perché |
|---|---|---|
| Occhiello dell'articolo | Sta nella riga di contesto accanto alla categoria, non ripetuto sotto | Nei design compare una volta sola; averlo in due punti era un difetto della prima stesura, corretto |
| Attacco tipografico | Le prime **due** parole in Newsreader, applicate automaticamente | I design le marcano a mano; chiedere alla redazione di farlo a ogni pezzo sarebbe lavoro in più per un dettaglio che deve essere costante |
| Voci del banner cookie | Tecnici, Statistiche, Contenuti di terze parti | Nessuna voce "profilazione": la monetizzazione è fuori perimetro (§6), dichiararla sarebbe descrivere un trattamento che non avviene |
| Limite del commento | 1500 caratteri, nel database e nell'interfaccia | I design mostrano 1500; il vincolo è replicato nel `check` della tabella, così l'interfaccia non promette un limite diverso da quello applicato |
| Distintivo "Redazione" | Colonna `is_staff` scrivibile solo dalla moderazione | Senza un trigger di protezione la policy RLS di aggiornamento del profilo avrebbe lasciato che un utente se lo assegnasse |
| Tema scuro | Non implementato | I design definiscono una sola palette. Inventarne una seconda sarebbe design non concordato |
| Accento del backoffice | Verde-petrolio `#1d5c63`, non il rosso del portale | E' nelle tavole, ed e' una buona idea: separa a colpo d'occhio lo strumento di lavoro dal sito pubblico |
| Generazione AI | Due tempi: prima la proposta, poi la bozza | I design mostrano l'accettazione elemento per elemento. Fra i due passaggi non si salva nulla: e' cio' che rende reale la revisione umana di RF-AI-08 invece di dichiararla |

### 2.8 Backoffice: ri-tematizzare Payload, non riscriverlo

I design del backoffice coprono quattordici schermate. La scelta su ciascuna e'
stata la stessa domanda: *Payload lo fa gia'?*

| Schermata | Scelta |
|---|---|
| Elenco articoli, editor, media library, categorie e tag, utenti, impostazioni | **Ri-tematizzate.** Payload deriva tutti i colori da una scala `--color-base-*`: ridefinirla con i toni della testata rifa' l'aspetto di ogni vista, campo e modale senza toccarne il comportamento |
| Navigazione laterale, marchio, dashboard, pastiglia di stato | **Sostituite** con componenti nostri: sono gli elementi che i design ridisegnano davvero |
| Moderazione, Hot topic, Genera da brief | **Costruite da zero:** in Payload non esistono |

Riscrivere elenco ed editor per farli combaciare al pixel avrebbe voluto dire
rifare versioni, bozze, autosalvataggio, permessi per campo e validazioni —
cioe' esattamente cio' per cui Payload e' stato scelto (§2.2).

**Conseguenza da mettere agli atti:** elenco articoli ed editor *hanno* il
carattere visivo di Esperia (palette, Newsreader sui titoli, pastiglie di
stato, verde-petrolio sulle azioni) ma la loro impaginazione resta quella di
Payload, non quella pixel-per-pixel delle tavole. Se il Committente vuole
anche quella su una schermata specifica, e' lavoro fattibile e va quantificato
a parte.

---

## 3. Come sono garantiti i requisiti che contano

### Nessun contenuto AI pubblicato senza revisione umana (RF-AI-08)

Il vincolo è applicato in tre punti indipendenti:

1. `enforceWorkflow` forza `_status: draft` su ogni articolo con origine AI;
2. la pubblicazione richiede `editorialStatus === 'approvato'` **e** ruolo editor;
3. l'endpoint di generazione non ha alcun percorso di codice che pubblichi.

Il primo punto vale anche per chiamate future che ignorassero la regola, perché
l'hook intercetta ogni scrittura — interfaccia, REST, GraphQL e Local API.

Verificato: lo script di seed tenta deliberatamente di pubblicare un articolo non
approvato e si aspetta il rifiuto; se la pubblicazione riuscisse, il seed
fallirebbe con un errore esplicito.

### Degrado controllato dell'AI (RNF-10)

`ottieniClient()` non solleva mai: restituisce un esito con il motivo
(`disattivato`, `non_configurato`). Gli endpoint AI rispondono `503` con un
messaggio leggibile; portale, community e backoffice non se ne accorgono.

Lo stesso vale per il CMS rispetto al portale: `CmsUnavailableError` è
intercettato in homepage, nel middleware e nelle chiamate di invalidazione, e la
cache di processo serve valori vecchi piuttosto che una pagina rotta.

### Cookie e consensi (RF-P-09, RNF-04)

- Nessuno script non necessario prima del consenso.
- Rifiutare costa un clic quanto accettare.
- Gli **embed di terze parti non caricano l'iframe** finché l'utente non lo
  chiede o non ha dato il consenso: al suo posto compare un segnaposto con
  l'indicazione della piattaforma. È la parte che i banner cookie dimenticano
  quasi sempre, e l'unica in cui il dato uscirebbe davvero prima del consenso.
- Plausible e Umami, senza cookie, si caricano subito; GA4 solo dopo consenso,
  con Consent Mode dichiarato.

### Server action = endpoint pubblico

Le azioni del backoffice (moderare un commento, bloccare un utente, generare
una bozza) sono server action di Next. Una server action e' raggiungibile via
HTTP come qualunque endpoint: il fatto che la richiami un bottone
dell'interfaccia non protegge nulla. **Ognuna verifica quindi sessione e ruolo
per conto proprio**, con `payload.auth()`, senza dare per scontato che chi la
chiama sia passato dal backoffice.

### Sicurezza (RNF-03)

- RLS su tutta la community; nessuna policy di `delete` sui commenti (la
  rimozione passa dalla moderazione, così la segnalazione collegata resta).
- Stato iniziale dei commenti imposto dalla policy: nessuno si auto-approva.
- Il serializzatore Lexical sanifica ogni testo e blocca gli schemi di URL
  pericolosi: è il punto in cui si previene una XSS stored.
- Header di sicurezza applicati dal middleware su ogni risposta.
- Segreti cifrati a riposo, mascherati in interfaccia.

---

## 4. Stato attuale

Verificato in esecuzione contro un Postgres reale:

- schema community applicato; profilo creato automaticamente alla registrazione;
  vincolo di profondità dei commenti rifiuta la risposta di terzo livello;
- CMS avviato, schema generato, seed completo;
- **gate del workflow: pubblicazione senza approvazione rifiutata**, percorso
  corretto completato;
- ricerca full-text con stemming italiano che risponde con documento completo e
  relazioni popolate;
- portale: home, articolo, categoria, tag, ricerca, sitemap, RSS, robots, 404 —
  tutte 200 (404 dove atteso);
- metadati: canonical, Open Graph completo, Twitter Card, `article:*`, e dati
  strutturati `NewsArticle` + `BreadcrumbList` + `WebSite`;
- `Cache-Control` corretto per famiglia di rotta, `no-store` su ricerca e 404;
- **backoffice** provato con dati reali: navigazione con contatori, dashboard a
  cinque code, elenco articoli con pastiglia di stato, hot topic con punteggio
  di rilevanza, generazione da brief, coda di moderazione;
- **moderazione end-to-end**: approvazione di un commento dalla coda →
  aggiornamento in Supabase → riga nel registro operazioni → contatori
  aggiornati in nav e schede;
- **controllo di sicurezza sul profilo**: un utente autenticato che tenta di
  assegnarsi il distintivo "Redazione" o di togliersi un ban viene respinto
  con un errore esplicito; la modifica della propria biografia passa;
- typecheck pulito su entrambe le applicazioni, build di produzione riuscita
  per portale e CMS;
- portale ispezionato a video con contenuti realistici (11 articoli, immagini,
  4 categorie): home, articolo, categoria, ricerca e 404 corrispondono alle
  tavole. **Non** abbiamo potuto verificare il rendering mobile a video —
  l'ambiente di cattura ignora il ridimensionamento della finestra; il layout
  usa unità fluide e un punto di rottura documentato a 760px, ma va guardato
  su un dispositivo reale prima del collaudo.

---

## 5. Da completare

In ordine di dipendenza, non di importanza:

1. **Ingestione fonti e ranking hot topic** (RF-AI-01/02) — è il pezzo mancante
   più grosso. La collection, la configurazione della rilevanza e tutta
   l'interfaccia ci sono e funzionano; manca il job periodico che interroga le
   fonti, raggruppa le notizie in cluster e calcola il punteggio. Dipende dalla
   scelta dei provider (§6).
2. **Pagine di autenticazione della community** (RF-C-01/02/07) — registrazione,
   accesso, profilo, richiesta di cancellazione. L'isola dei commenti già vi
   rimanda.
3. **Assistenza all'editing** (RF-AI-06) — riscrittura, sintesi, titoli
   alternativi e suggerimenti SEO *dentro* l'editor. Diverso dalla generazione
   da zero, che è fatta: qui si lavora su un testo esistente.
4. **Reazioni sugli articoli** (RF-C-04) — sui commenti funzionano; sulla
   pagina articolo l'interfaccia è da fare.
5. **Regole anti-spam automatiche** (RF-C-06) — le colonne `auto_flagged` e
   `auto_flag_reason` esistono e la coda le mostra; le regole che le
   valorizzano no.
6. **Immagini assistite** (RF-AI-07) — configurazione pronta, provider da
   scegliere al kick-off.
7. **Statistiche di consultazione** (RF-B-14) — integrazione analytics
   configurabile, cruscotto no.

---

## 6. Questioni aperte per il kick-off

| Tema | Perché va deciso presto |
|---|---|
| **Hosting** | Determina se conviene un adapter specifico. Finora tutto è portabile: Astro `standalone`, CMS `output: standalone`, Postgres puro. |
| **Fonti news** | NewsAPI, GDELT e SerpAPI hanno costi e limiti molto diversi e cambiano il disegno dell'ingestione. Sono a carico del Committente (V-02). |
| **Region dei dati** | Supabase e storage in UE per RNF-04. |
| **Testi legali** | Privacy e cookie policy sono forniti dal Committente (RNF-04); i contenitori esistono già. |
| **Priorità Should/Could** | Con V-01 a due mesi, l'analisi stessa prevede di consolidarle in kick-off. Vale la pena usarla. |
