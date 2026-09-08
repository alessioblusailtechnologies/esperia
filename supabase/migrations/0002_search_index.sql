-- =============================================================================
-- Indice di ricerca full-text sugli articoli — RF-P-05
--
-- PERCHE' UNO SCHEMA SEPARATO
-- Payload gestisce lo schema `payload` da solo: in sviluppo sincronizza le
-- tabelle con la configurazione (`push`) e cancella tutto cio' che non
-- riconosce. Una colonna generata aggiunta a payload.articles verrebbe quindi
-- proposta per l'eliminazione al primo avvio successivo — verificato sul campo.
--
-- L'indice vive percio' in uno schema tutto suo, `ricerca`, che Payload non
-- tocca. A tenerlo allineato e' un hook applicativo del CMS
-- (apps/cms/src/hooks/searchIndex.ts), non un trigger: cosi' la
-- sincronizzazione e' visibile nel codice, testabile e non dipende da oggetti
-- di database che una migrazione futura potrebbe far sparire in silenzio.
--
-- Questa migration va eseguita DOPO il primo avvio del CMS, che crea
-- payload.articles. Vedi docs/architettura.md, "Ordine di inizializzazione".
-- =============================================================================

create extension if not exists "unaccent";
create extension if not exists "pg_trgm";

create schema if not exists ricerca;

/*
 * Configurazione di ricerca italiana con rimozione degli accenti.
 * Senza unaccent, "citta" non trova "città" — ed e' esattamente il modo in cui
 * la gente digita nella casella di ricerca.
 */
do $$
begin
  if not exists (select 1 from pg_ts_config where cfgname = 'italiano_unaccent') then
    create text search configuration public.italiano_unaccent (copy = italian);

    alter text search configuration public.italiano_unaccent
      alter mapping for hword, hword_part, word
      with unaccent, italian_stem;
  end if;
end $$;

/*
 * Indice di ricerca.
 *
 * Contiene anche stato e data di pubblicazione, cosi' la query di ricerca si
 * risolve interamente qui dentro: recupera gli id ordinati per pertinenza e
 * solo dopo il CMS carica i documenti completi applicando il proprio access
 * control. Nessuna riga di questa tabella e' mai servita direttamente.
 */
create table if not exists ricerca.articoli (
  article_id    uuid primary key,
  search_vector tsvector not null,
  published_at  timestamptz,
  is_published  boolean not null default false,
  updated_at    timestamptz not null default now()
);

create index if not exists articoli_search_idx
  on ricerca.articoli using gin (search_vector);

-- La ricerca guarda solo gli articoli pubblicati: indice parziale.
create index if not exists articoli_pubblicati_idx
  on ricerca.articoli (published_at desc)
  where is_published;

/*
 * Costruzione del vettore, centralizzata in una funzione.
 *
 * I pesi determinano il ranking:
 *   A titolo              una parola nel titolo vale piu' di dieci nel corpo
 *   B occhiello, sottotitolo, sommario
 *   C corpo               testo piatto estratto dall'editor dal CMS
 */
create or replace function ricerca.costruisci_vettore(
  p_titolo     text,
  p_occhiello  text,
  p_sottotitolo text,
  p_sommario   text,
  p_corpo      text
)
returns tsvector
language sql
immutable
as $$
  select
    setweight(to_tsvector('public.italiano_unaccent', coalesce(p_titolo, '')), 'A') ||
    setweight(to_tsvector('public.italiano_unaccent', coalesce(p_occhiello, '')), 'B') ||
    setweight(to_tsvector('public.italiano_unaccent', coalesce(p_sottotitolo, '')), 'B') ||
    setweight(to_tsvector('public.italiano_unaccent', coalesce(p_sommario, '')), 'B') ||
    setweight(to_tsvector('public.italiano_unaccent', coalesce(p_corpo, '')), 'C');
$$;

/* Upsert chiamato dal CMS a ogni salvataggio di articolo. */
create or replace function ricerca.aggiorna_articolo(
  p_id          uuid,
  p_titolo      text,
  p_occhiello   text,
  p_sottotitolo text,
  p_sommario    text,
  p_corpo       text,
  p_published   boolean,
  p_published_at timestamptz
)
returns void
language sql
as $$
  insert into ricerca.articoli (article_id, search_vector, published_at, is_published, updated_at)
  values (
    p_id,
    ricerca.costruisci_vettore(p_titolo, p_occhiello, p_sottotitolo, p_sommario, p_corpo),
    p_published_at,
    p_published,
    now()
  )
  on conflict (article_id) do update
    set search_vector = excluded.search_vector,
        published_at  = excluded.published_at,
        is_published  = excluded.is_published,
        updated_at    = now();
$$;

/*
 * Ricostruzione completa dell'indice.
 *
 * Serve al primo popolamento e come rete di sicurezza: se l'indice dovesse
 * andare fuori sincrono, una singola chiamata lo riallinea leggendo la
 * sorgente di verita', cioe' le tabelle di Payload.
 *   select ricerca.ricostruisci();
 */
create or replace function ricerca.ricostruisci()
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  truncate ricerca.articoli;

  insert into ricerca.articoli (article_id, search_vector, published_at, is_published)
  select
    a.id,
    ricerca.costruisci_vettore(a.title, a.kicker, a.subtitle, a.excerpt, a.search_text),
    a.published_at,
    a._status = 'published'
  from payload.articles a;

  get diagnostics n = row_count;
  return n;
end;
$$;

-- Popolamento iniziale con gli articoli gia' presenti.
select ricerca.ricostruisci();
