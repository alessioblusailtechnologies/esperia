-- =============================================================================
-- Esperia — sezione community
-- Copre RF-C-01..07, RF-B-10, RNF-03, RNF-04.
--
-- Tutto vive nello schema `esperia`, non in `public`: il progetto Supabase puo'
-- essere condiviso con altre applicazioni (in prova lo e', con moonbrand), e
-- tabelle dai nomi generici come `profiles` o `comments` in `public` si
-- scontrerebbero con le loro. Lo schema va aggiunto agli "Exposed schemas"
-- dell'API (Settings → API), altrimenti PostgREST non lo serve.
--
-- Perche' questi dati stanno qui e non in Payload:
--   la community e' ad alta frequenza di scrittura e va protetta per riga,
--   utente per utente. RLS fa rispettare le regole nel database, quindi valgono
--   anche se un domani il portale venisse riscritto o qualcuno chiamasse
--   direttamente PostgREST con la chiave anon. Il CMS occupa lo schema
--   `payload`, che non e' esposto dall'API di Supabase.
--
-- Gli utenti (auth.users) invece sono del progetto, non dello schema: in un
-- progetto condiviso lo stesso account puo' appartenere anche a un'altra
-- applicazione. Per questo il profilo nasce solo dalle registrazioni del
-- portale, si crea al primo accesso per chi arriva con un account esistente, e
-- la cancellazione tocca auth.users solo per gli account nati da esperia.
-- =============================================================================

create extension if not exists "unaccent";
create extension if not exists "pg_trgm";

create schema if not exists esperia;

-- PostgREST entra con questi ruoli: senza USAGE lo schema e' invisibile anche
-- con le policy giuste. I permessi sulle tabelle restano filtrati da RLS.
grant usage on schema esperia to anon, authenticated, service_role;
alter default privileges in schema esperia
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema esperia
  grant usage, select on sequences to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Tipi
-- -----------------------------------------------------------------------------

do $$ begin
  create type esperia.comment_status as enum ('in_attesa', 'approvato', 'rifiutato', 'eliminato');
exception when duplicate_object then null; end $$;

do $$ begin
  create type esperia.reaction_type as enum ('mi_piace', 'utile', 'non_daccordo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type esperia.reaction_target as enum ('article', 'comment');
exception when duplicate_object then null; end $$;

do $$ begin
  create type esperia.report_reason as enum ('spam', 'offensivo', 'disinformazione', 'fuori_tema', 'altro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type esperia.report_status as enum ('aperta', 'accolta', 'respinta');
exception when duplicate_object then null; end $$;


-- -----------------------------------------------------------------------------
-- Profili — RF-C-02
-- -----------------------------------------------------------------------------

create table if not exists esperia.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  display_name          text not null check (char_length(display_name) between 2 and 50),
  avatar_url            text,
  bio                   text check (bio is null or char_length(bio) <= 500),

  /*
   * Distintivo "Redazione" accanto al nome, previsto dai design.
   * Lo assegna solo la moderazione con la chiave di servizio: nessuna policy
   * di UPDATE lo espone all'utente, che altrimenti potrebbe attribuirselo.
   */
  is_staff              boolean not null default false,

  -- Moderazione: un utente bannato conserva il profilo ma non puo' piu' scrivere. RF-B-10
  banned_at             timestamptz,
  banned_reason         text,

  -- RF-C-07: la richiesta di cancellazione e' tracciata, l'esecuzione e' asincrona
  -- (va anonimizzato anche cio' che l'utente ha scritto).
  deletion_requested_at timestamptz,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table esperia.profiles is
  'Profilo pubblico della community. Identita e credenziali restano in auth.users.';


-- -----------------------------------------------------------------------------
-- Commenti — RF-C-03
-- -----------------------------------------------------------------------------

create table if not exists esperia.comments (
  id               uuid primary key default gen_random_uuid(),

  -- Riferimento all'articolo in payload.articles. Volutamente SENZA foreign key:
  -- le migrazioni di Payload ricreano le proprie tabelle e un vincolo cross-schema
  -- le farebbe fallire. L'integrita' e' garantita a livello applicativo, la
  -- pulizia dei commenti orfani da un job di manutenzione.
  article_id       uuid not null,

  author_id        uuid references esperia.profiles (id) on delete set null,
  parent_id        uuid references esperia.comments (id) on delete cascade,

  body             text not null check (char_length(body) between 2 and 1500),
  status           esperia.comment_status not null default 'in_attesa',

  -- Esito delle regole automatiche anti-spam applicate prima della coda umana. RF-C-06
  auto_flagged     boolean not null default false,
  auto_flag_reason text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  edited_at        timestamptz
);

create index if not exists comments_article_idx
  on esperia.comments (article_id, status, created_at desc);
create index if not exists comments_parent_idx on esperia.comments (parent_id);
create index if not exists comments_author_idx on esperia.comments (author_id);
-- Coda di moderazione: l'unica query che il backoffice fa spesso. RF-B-10
create index if not exists comments_moderation_idx
  on esperia.comments (status, created_at) where status = 'in_attesa';

-- RF-C-03: risposte annidate a UN SOLO livello.
-- Il vincolo sta qui e non nell'interfaccia: e' una regola di dominio, non di UI.
create or replace function esperia.enforce_comment_depth()
returns trigger
language plpgsql
as $$
declare
  parent_parent uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select parent_id into parent_parent from esperia.comments where id = new.parent_id;

  if not found then
    raise exception 'Il commento a cui stai rispondendo non esiste.';
  end if;

  if parent_parent is not null then
    raise exception 'Sono ammesse risposte a un solo livello di profondita.';
  end if;

  return new;
end;
$$;

drop trigger if exists comments_depth_check on esperia.comments;
create trigger comments_depth_check
  before insert or update of parent_id on esperia.comments
  for each row execute function esperia.enforce_comment_depth();


-- -----------------------------------------------------------------------------
-- Reazioni — RF-C-04
-- -----------------------------------------------------------------------------

create table if not exists esperia.reactions (
  id          uuid primary key default gen_random_uuid(),
  target_type esperia.reaction_target not null,
  target_id   uuid not null,
  user_id     uuid not null references esperia.profiles (id) on delete cascade,
  type        esperia.reaction_type not null,
  created_at  timestamptz not null default now(),

  -- Una sola reazione per utente e per oggetto: cambiare reazione e' un UPDATE.
  unique (target_type, target_id, user_id)
);

create index if not exists reactions_target_idx on esperia.reactions (target_type, target_id);


-- -----------------------------------------------------------------------------
-- Segnalazioni — RF-C-05
-- -----------------------------------------------------------------------------

create table if not exists esperia.reports (
  id          uuid primary key default gen_random_uuid(),
  comment_id  uuid not null references esperia.comments (id) on delete cascade,
  reporter_id uuid references esperia.profiles (id) on delete set null,
  reason      esperia.report_reason not null,
  note        text check (note is null or char_length(note) <= 1000),
  status      esperia.report_status not null default 'aperta',

  -- id dell'utente di backoffice (payload.users): nessuna FK, schemi separati.
  resolved_by uuid,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),

  -- Un utente non segnala due volte lo stesso commento.
  unique (comment_id, reporter_id)
);

create index if not exists reports_open_idx
  on esperia.reports (status, created_at) where status = 'aperta';


-- -----------------------------------------------------------------------------
-- updated_at automatico
-- -----------------------------------------------------------------------------

create or replace function esperia.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on esperia.profiles;
create trigger profiles_touch before update on esperia.profiles
  for each row execute function esperia.touch_updated_at();

drop trigger if exists comments_touch on esperia.comments;
create trigger comments_touch before update on esperia.comments
  for each row execute function esperia.touch_updated_at();


-- -----------------------------------------------------------------------------
-- Creazione automatica del profilo alla registrazione — RF-C-01
-- -----------------------------------------------------------------------------

create or replace function esperia.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = esperia
as $$
begin
  -- Solo le registrazioni del portale (che dichiarano app = 'esperia'): in un
  -- progetto condiviso gli iscritti delle altre applicazioni non sono lettori.
  if coalesce(new.raw_user_meta_data ->> 'app', '') <> 'esperia' then
    return new;
  end if;

  insert into esperia.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),   -- login social (RF-C-08)
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Nome con prefisso: `on_auth_user_created` e' il nome degli esempi di
-- Supabase, e un'altra applicazione sullo stesso progetto puo' averlo gia'.
drop trigger if exists esperia_on_auth_user_created on auth.users;
create trigger esperia_on_auth_user_created
  after insert on auth.users
  for each row execute function esperia.handle_new_user();


-- -----------------------------------------------------------------------------
-- Funzioni di supporto
-- -----------------------------------------------------------------------------

create or replace function esperia.is_banned(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = esperia
as $$
  select exists (select 1 from esperia.profiles p where p.id = uid and p.banned_at is not null);
$$;

/*
 * Profilo per chi accede con un account gia' esistente nel progetto (nato da
 * un'altra applicazione, o prima del filtro su app): il portale la chiama dopo
 * l'accesso. Idempotente.
 */
create or replace function esperia.assicura_profilo()
returns void
language plpgsql
security definer
set search_path = esperia
as $$
declare
  u auth.users%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Operazione consentita solo a un utente autenticato.';
  end if;

  select * into u from auth.users where id = auth.uid();

  insert into esperia.profiles (id, display_name, avatar_url)
  values (
    u.id,
    coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
      split_part(u.email, '@', 1)
    ),
    u.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
end;
$$;

/*
 * RF-C-07 — cancellazione account.
 *
 * Non cancelliamo i commenti: li anonimizziamo. Rimuovere i messaggi
 * spezzerebbe i thread altrui, mentre il GDPR chiede che il dato non sia piu'
 * riconducibile alla persona. L'utente in auth.users viene eliminato, e con lui
 * email, credenziali e profilo.
 */
create or replace function esperia.request_account_deletion()
returns void
language plpgsql
security definer
set search_path = esperia
as $$
begin
  if auth.uid() is null then
    raise exception 'Operazione consentita solo a un utente autenticato.';
  end if;

  update esperia.profiles
     set deletion_requested_at = now()
   where id = auth.uid();
end;
$$;

create or replace function esperia.anonymize_user(target uuid)
returns void
language plpgsql
security definer
set search_path = esperia
as $$
begin
  -- Il testo resta, l'autore no.
  update esperia.comments set author_id = null where author_id = target;
  delete from esperia.reactions where user_id = target;
  update esperia.reports set reporter_id = null where reporter_id = target;

  delete from esperia.profiles where id = target;

  -- L'account di accesso si elimina solo se e' nato da esperia: in un progetto
  -- condiviso potrebbe servire ancora all'altra applicazione. In un progetto
  -- dedicato tutti gli account nascono dal portale, e la cancellazione e' completa.
  delete from auth.users
   where id = target
     and raw_user_meta_data ->> 'app' = 'esperia';
end;
$$;

revoke all on function esperia.anonymize_user(uuid) from public, anon, authenticated;
grant execute on function esperia.anonymize_user(uuid) to service_role;
grant execute on function esperia.assicura_profilo() to authenticated;
grant execute on function esperia.request_account_deletion() to authenticated;


-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table esperia.profiles  enable row level security;
alter table esperia.comments  enable row level security;
alter table esperia.reactions enable row level security;
alter table esperia.reports   enable row level security;

-- --- Profili ----------------------------------------------------------------
-- Il profilo e' pubblico (nome e avatar compaiono sotto i commenti).

drop policy if exists profiles_select on esperia.profiles;
create policy profiles_select on esperia.profiles
  for select using (true);

drop policy if exists profiles_update_own on esperia.profiles;
create policy profiles_update_own on esperia.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

/*
 * L'utente puo' modificare solo nome, avatar e biografia. Un trigger impedisce
 * di toccare i campi amministrativi: senza, la policy sopra lascerebbe scrivere
 * qualunque colonna della propria riga, distintivo e ban compresi.
 */
create or replace function esperia.proteggi_campi_profilo()
returns trigger
language plpgsql
as $$
begin
  /*
   * Chi puo' toccare i campi amministrativi si riconosce dal RUOLO POSTGRES,
   * non da una claim del token.
   *
   * Verificato sul campo: basare il controllo su
   * current_setting('request.jwt.claim.role') lo rendeva fragile in due modi.
   * Le versioni recenti di PostgREST espongono le claim in un'altra forma
   * (request.jwt.claims come JSON), e qualunque accesso diretto al database —
   * migrazioni, script di manutenzione — non ha alcuna claim: in entrambi i
   * casi la moderazione avrebbe smesso di funzionare SENZA errori, con
   * l'aggiornamento semplicemente riportato indietro.
   *
   * Il ruolo, invece, e' sempre definito: `service_role` con la chiave di
   * servizio di Supabase, `postgres` in manutenzione, `authenticated` per
   * l'utente comune.
   */
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  /*
   * Per tutti gli altri i campi amministrativi sono immutabili. Solleviamo
   * un errore invece di riallineare in silenzio: un blocco utente che "non
   * attacca" senza dirlo e' peggio di un'operazione fallita in modo esplicito.
   */
  if new.is_staff is distinct from old.is_staff
     or new.banned_at is distinct from old.banned_at
     or new.banned_reason is distinct from old.banned_reason then
    raise exception 'Campi riservati alla moderazione: non modificabili dal profilo.';
  end if;

  -- La richiesta di cancellazione la registra l'utente su se stesso (RF-C-07),
  -- ma una volta presentata non puo' ritirarla da solo: la esegue la redazione.
  if old.deletion_requested_at is not null
     and new.deletion_requested_at is distinct from old.deletion_requested_at then
    raise exception 'La richiesta di cancellazione non puo essere modificata.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect on esperia.profiles;
create trigger profiles_protect
  before update on esperia.profiles
  for each row execute function esperia.proteggi_campi_profilo();

-- Nessuna policy di insert/delete: il profilo nasce dal trigger di registrazione
-- e muore con l'account (RF-C-07).


-- --- Commenti ---------------------------------------------------------------

drop policy if exists comments_select on esperia.comments;
create policy comments_select on esperia.comments
  for select using (
    status = 'approvato'
    -- L'autore vede sempre il proprio commento, anche mentre e' in moderazione:
    -- altrimenti sembrerebbe che l'invio non abbia funzionato.
    or (auth.uid() is not null and author_id = auth.uid())
  );

drop policy if exists comments_insert on esperia.comments;
create policy comments_insert on esperia.comments
  for insert with check (
    auth.uid() is not null
    and author_id = auth.uid()
    and not esperia.is_banned(auth.uid())
    -- Lo stato iniziale non e' negoziabile dal client: nessuno si auto-approva.
    and status = 'in_attesa'
  );

drop policy if exists comments_update_own on esperia.comments;
create policy comments_update_own on esperia.comments
  for update using (
    auth.uid() = author_id
    and status <> 'eliminato'
    -- Finestra di modifica di 15 minuti: oltre, il commento e' parte della discussione.
    and created_at > now() - interval '15 minutes'
  ) with check (
    auth.uid() = author_id
    and status = 'in_attesa'
  );

-- Nessuna delete: la rimozione passa dalla moderazione (status = 'eliminato'),
-- cosi' resta traccia per le segnalazioni collegate.


-- --- Reazioni ---------------------------------------------------------------

drop policy if exists reactions_select on esperia.reactions;
create policy reactions_select on esperia.reactions
  for select using (true);

drop policy if exists reactions_insert_own on esperia.reactions;
create policy reactions_insert_own on esperia.reactions
  for insert with check (
    auth.uid() = user_id and not esperia.is_banned(auth.uid())
  );

drop policy if exists reactions_update_own on esperia.reactions;
create policy reactions_update_own on esperia.reactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists reactions_delete_own on esperia.reactions;
create policy reactions_delete_own on esperia.reactions
  for delete using (auth.uid() = user_id);


-- --- Segnalazioni -----------------------------------------------------------
-- Chi segnala vede solo le proprie segnalazioni: l'esito e' materia di redazione.

drop policy if exists reports_select_own on esperia.reports;
create policy reports_select_own on esperia.reports
  for select using (auth.uid() = reporter_id);

drop policy if exists reports_insert on esperia.reports;
create policy reports_insert on esperia.reports
  for insert with check (
    auth.uid() is not null
    and reporter_id = auth.uid()
    and status = 'aperta'
  );


-- =============================================================================
-- Viste di lettura per il portale
-- =============================================================================

-- Conteggi aggregati, cosi' la pagina articolo non scarica tutti i commenti
-- solo per scrivere "12 commenti".
create or replace view esperia.article_comment_counts
with (security_invoker = true) as
  select article_id, count(*)::int as approved_comments
    from esperia.comments
   where status = 'approvato'
   group by article_id;

create or replace view esperia.reaction_counts
with (security_invoker = true) as
  select target_type, target_id, type, count(*)::int as total
    from esperia.reactions
   group by target_type, target_id, type;

grant select on esperia.article_comment_counts to anon, authenticated;
grant select on esperia.reaction_counts to anon, authenticated;

-- Le tabelle create sopra, per chi applica la migrazione senza i privilegi di
-- default (le grant di default valgono solo per tabelle create dopo).
grant select, insert, update, delete on all tables in schema esperia
  to anon, authenticated, service_role;
