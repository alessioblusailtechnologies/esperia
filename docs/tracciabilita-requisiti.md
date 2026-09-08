# Tracciabilità dei requisiti

Matrice requisito → implementazione → stato. Serve al collaudo previsto al §7
dell'analisi ("verifica congiunta dei requisiti Must tramite casi di test
concordati per ciascun macro-modulo").

**Legenda stato**
✅ implementato e verificato in esecuzione · 🟡 impalcatura pronta, interfaccia o
job mancante · ⬜ da fare

---

## Portale news pubblico (§3.1)

| ID | Requisito | Pri. | Dove | Stato |
|---|---|---|---|---|
| RF-P-01 | Homepage | Must | `portal/src/pages/index.astro`, global `site-settings` | ✅ |
| RF-P-02 | Navigazione per categorie | Must | `portal/src/pages/categoria/[slug].astro` + `Pagination` | ✅ |
| RF-P-03 | Navigazione per tag | Must | `portal/src/pages/tag/[slug].astro` | ✅ |
| RF-P-04 | Pagina articolo | Must | `portal/src/pages/[slug].astro`, `getRelatedArticles` | ✅ |
| RF-P-05 | Ricerca full-text | Must | `cms/src/endpoints/search.ts`, `supabase/migrations/0002` | ✅ |
| RF-P-06 | Condivisione social + OG | Must | `ShareButtons.astro`, `layouts/Base.astro` | ✅ |
| RF-P-07 | SEO tecnica di base | Must | `lib/seo.ts`, `sitemap.xml.ts`, `robots.txt.ts`, `middleware.ts`, collection `redirects` | ✅ |
| RF-P-08 | Responsive design | Must | griglie fluide, scala tipografica `clamp()`, menu a fisarmonica sotto 760px | 🟡 implementato, **non ancora verificato su dispositivo reale** |
| RF-P-09 | Cookie banner e consensi | Must | `islands/CookieBanner.tsx`, segnaposto embed in `lexical-render.ts` | ✅ |
| RF-P-10 | Pagine statiche | Should | collection `pages`, `pagina/[slug].astro` | ✅ |
| RF-P-11 | Feed RSS | Should | `rss.xml.ts` (generale e per categoria) | ✅ |
| RF-P-12 | Archivio storico | Could | `portal/src/pages/archivio.astro` | ✅ |

**Note di verifica.** Metadati e dati strutturati controllati sulla pagina
renderizzata: `canonical`, Open Graph completo, Twitter Card, `article:*`,
JSON-LD `NewsArticle` + `BreadcrumbList` + `WebSite` con `SearchAction`.
`robots.txt` blocca tutto fuori produzione, per non far indicizzare l'ambiente
di collaudo.

---

## Sezione community (§3.2)

| ID | Requisito | Pri. | Dove | Stato |
|---|---|---|---|---|
| RF-C-01 | Registrazione e login | Must | Supabase Auth, trigger `handle_new_user`; segnaposto in `portal/src/pages/accedi.astro` | 🟡 modulo di accesso da fare |
| RF-C-02 | Profilo utente | Must | tabella `profiles` + RLS; segnaposto in `portal/src/pages/registrati.astro` | 🟡 pagina profilo da fare |
| RF-C-03 | Commenti con risposte a 1 livello | Must | `islands/CommentsSection.tsx`, trigger `enforce_comment_depth` | ✅ |
| RF-C-04 | Reazioni | Should | tabella `reactions`; "Mi piace" sui commenti nell'isola | ✅ sui commenti; 🟡 sugli articoli |
| RF-C-05 | Segnalazione contenuti | Must | tabella `reports`, azione nell'isola commenti | ✅ |
| RF-C-06 | Moderazione automatica | Should | colonne `auto_flagged` / `auto_flag_reason` | 🟡 regole da implementare |
| RF-C-07 | Cancellazione account | Must | `request_account_deletion()`, `anonymize_user()` | 🟡 pulsante nel profilo da fare |
| RF-C-08 | Login social | Could | il trigger legge già `full_name` e `avatar_url` dal provider | 🟡 |
| RF-C-09 | Newsletter | Could | — | ⬜ |

**Note di verifica.** Il limite di profondità è applicato dal database, non
dall'interfaccia: una risposta di terzo livello viene rifiutata con un errore
esplicito — provato. Lo stato iniziale `in_attesa` è imposto dalla policy RLS di
inserimento: nessun client può auto-approvarsi. La cancellazione anonimizza i
commenti invece di rimuoverli, così i thread altrui restano leggibili.

---

## Backoffice editoriale (§3.3)

| ID | Requisito | Pri. | Dove | Stato |
|---|---|---|---|---|
| RF-B-01 | Autenticazione backoffice separata | Must | collection `users`, distinta da Supabase Auth | ✅ |
| RF-B-02 | Ruoli e permessi | Must | `cms/src/access/index.ts`, `packages/shared` | ✅ |
| RF-B-03 | Gestione articoli | Must | collection `articles` | ✅ |
| RF-B-04 | Editor ricco con anteprima | Must | Lexical + blocchi citazione/embed; live preview a 3 breakpoint | ✅ |
| RF-B-05 | Workflow editoriale | Must | `hooks/enforceWorkflow.ts`, `WORKFLOW_TRANSITIONS` | ✅ |
| RF-B-06 | Pubblicazione programmata | Must | `versions.drafts.schedulePublish` + coda job | ✅ |
| RF-B-07 | Media library | Must | collection `media`, 4 varianti generate con sharp | ✅ |
| RF-B-08 | Gestione categorie e tag | Must | collection `categories` (con ordinamento) e `tags` | ✅ |
| RF-B-09 | Campi SEO per articolo | Must | `fields/seo.ts`, `fields/slug.ts` | ✅ |
| RF-B-10 | Moderazione community | Must | `cms/src/components/views/Moderazione/`, `cms/src/lib/supabase.ts` | ✅ |
| RF-B-11 | Gestione utenti | Must | access control su `users`, campo `active` | ✅ |
| RF-B-12 | Dashboard redazionale | Should | `cms/src/components/views/Dashboard.tsx` (5 code di lavoro) | ✅ |
| RF-B-13 | Revisioni articolo | Should | `versions.maxPerDoc: 25` + autosave | ✅ |
| RF-B-14 | Statistiche di base | Could | integrazione analytics configurabile | 🟡 |

**Note di verifica.** Il gate del workflow è provato dallo script di seed, che
tenta deliberatamente di pubblicare un articolo non approvato e si aspetta il
rifiuto: se la pubblicazione riuscisse, il seed fallirebbe. Il redattore può
modificare solo i propri articoli e solo finché non sono approvati — regola
espressa come clausola `Where`, quindi applicata dal database e non
dall'interfaccia.

---

## Modulo AI (§3.4)

| ID | Requisito | Pri. | Dove | Stato |
|---|---|---|---|---|
| RF-AI-01 | Ingestione fonti | Must | collection `sources` (5 tipi, chiave cifrata, diagnostica) | 🟡 job periodico da fare |
| RF-AI-02 | Individuazione hot topic | Must | collection `hot-topics`; vista con filtri, rilevanza e fonti | 🟡 interfaccia ✅, algoritmo di rilevazione da fare |
| RF-AI-03 | Configurazione rilevanza | Should | global `ai-settings`, scheda "Linea editoriale" | ✅ |
| RF-AI-04 | Generazione da hot topic | Must | vista Hot topic + `azioniAi.ts` + `PannelloProposta` | ✅ |
| RF-AI-05 | Generazione da brief | Must | vista Genera da brief + `azioniAi.ts` | ✅ |
| RF-AI-06 | Assistenza all'editing | Should | — | ⬜ |
| RF-AI-07 | Immagini assistite | Should | configurazione provider + dicitura obbligatoria | 🟡 |
| RF-AI-08 | Stato bozza obbligatorio | Must | `enforceWorkflow` + endpoint senza percorsi di pubblicazione | ✅ |
| RF-AI-09 | Configurazione provider | Must | `fields/encryptedText.ts`, AES-256-GCM, solo Amministratore | ✅ |
| RF-AI-10 | Visibilità consumi | Should | collection `ai-usage`, sola lettura, con costo stimato | ✅ |
| RF-AI-11 | Tracciabilità AI | Should | gruppo `ai` sull'articolo (origine, modello, brief, data) | ✅ |

**Note di verifica.** Il flusso e' in due tempi: la proposta si legge e si
corregge nel pannello, e solo premendo «Apri in editor come bozza» viene creato
qualcosa nel database. Provato in ambiente senza chiave API: la schermata
risponde «Nessuna chiave API configurata. Un Amministratore può inserirla in
Impostazioni AI», non un errore di sistema (RNF-10).

La generazione usa structured output con schema validato:
il modello non può restituire una forma diversa da quella attesa. Fra i campi
richiesti c'è `puntiDaVerificare`, che elenca ciò che il redattore deve
controllare o che manca — l'assistente dichiara i propri limiti invece di
riempire i buchi inventando.

---

## Requisiti non funzionali (§4)

| ID | Requisito | Pri. | Dove | Stato |
|---|---|---|---|---|
| RNF-01 | Prestazioni | Must | Astro senza JS sulle pagine articolo; `Cache-Control` per rotta; immagini pre-dimensionate con `width`/`height`; isole `client:visible` | ✅ |
| RNF-02 | Scalabilità | Should | portale e CMS scalabili separatamente; cache CDN davanti | ✅ impostata |
| RNF-03 | Sicurezza applicativa | Must | RLS, sanificazione rich text, header di sicurezza, segreti cifrati, blocco account dopo 5 tentativi | ✅ |
| RNF-04 | Privacy e GDPR | Must | consensi granulari, embed sotto consenso, anonimizzazione account | ✅ meccanismi; testi legali dal Committente |
| RNF-05 | Compatibilità | Must | HTML semantico, CSS moderno con fallback, nessuna API sperimentale | ✅ |
| RNF-06 | Usabilità backoffice | Must | editor a schede, etichette in italiano, navigazione per flusso di lavoro con contatori delle code | ✅ |
| RNF-07 | Accessibilità | Should | `alt` obbligatorio, gerarchia dei titoli, focus visibile, salta-contenuto, `prefers-reduced-motion` | ✅ |
| RNF-08 | Logging e diagnostica | Should | collection `audit-log` immutabile + log applicativi | ✅ |
| — | Design del portale | — | `portal/src/styles/tokens.css` + componenti; Home, Articolo, Listing, Ricerca v1 | ✅ |
| — | Design del backoffice | — | tema in `cms/src/app/(payload)/custom.scss` + componenti in `cms/src/components/`; Nav, Dashboard, Pastiglia, Hot topic, Brief, Moderazione | ✅ · elenco ed editor ri-tematizzati, non rifatti al pixel (vedi architettura §2.8) |
| RNF-09 | Lingua italiana | Must | interfaccia admin in italiano, `it-IT` ovunque, ricerca con stemming italiano | ✅ |
| RNF-10 | Degrado controllato AI | Must | `ottieniClient` non solleva mai; `CmsUnavailableError` gestito; cache che serve valori vecchi | ✅ |

---

## Fuori perimetro (§6)

Confermati non implementati e non pianificati: produzione di contenuti
editoriali, SEO avanzata, manutenzione post-rilascio, hosting e costi API, app
mobile native, multilingua, monetizzazione.
