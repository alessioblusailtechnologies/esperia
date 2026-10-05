-- =============================================================================
-- Esperia — regole anti-spam sui commenti (RF-C-06)
--
-- Tutti i commenti nascono 'in_attesa' e passano dalla redazione: queste regole
-- non decidono nulla, mettono un segnale sui commenti che meritano piu'
-- attenzione (`auto_flagged`, `auto_flag_reason`), e la coda di moderazione lo
-- mostra. L'unica eccezione e' la raffica estrema, che viene rifiutata: lì il
-- problema non e' il contenuto ma il volume, e farlo arrivare in coda vorrebbe
-- dire seppellire i commenti veri.
--
-- Le regole stanno in un trigger e non nel portale per la stessa ragione di
-- RLS: valgono anche per chi chiama PostgREST direttamente con la chiave anon.
--
-- Va eseguita dopo 0001; non dipende dal CMS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Termini da segnalare, scelti dalla redazione
-- -----------------------------------------------------------------------------

/*
 * Li scrive il backoffice (Impostazioni portale → Community) con la chiave di
 * servizio. Nessuna policy: ne' anon ne' authenticated possono leggerli, perche'
 * un elenco pubblico sarebbe un manuale per aggirarlo.
 */
create table if not exists public.moderation_terms (
  term       text primary key check (char_length(term) between 2 and 80),
  created_at timestamptz not null default now()
);

alter table public.moderation_terms enable row level security;

comment on table public.moderation_terms is
  'Termini che fanno segnalare un commento alla moderazione. Gestiti dal backoffice.';


-- -----------------------------------------------------------------------------
-- Regole
-- -----------------------------------------------------------------------------

create or replace function public.regole_antispam()
returns trigger
language plpgsql
security definer
-- `extensions` perche' su Supabase unaccent puo' vivere li' e non in public.
set search_path = public, extensions
as $$
declare
  motivi          text[] := '{}';
  testo           text := new.body;
  normalizzato    text := lower(unaccent(new.body));
  link            int;
  recenti         int;
  lettere         int;
  maiuscole       int;
  iscritto_il     timestamptz;
  termine         text;
begin
  /*
   * Il segnale lo decide il database, non chi scrive: senza questo reset un
   * client potrebbe inviare `auto_flagged = false` su un commento che le regole
   * avrebbero segnalato, o il contrario.
   */
  new.auto_flagged := false;
  new.auto_flag_reason := null;

  -- Raffica: oltre 10 commenti in 10 minuti non e' una discussione.
  if tg_op = 'INSERT' and new.author_id is not null then
    select count(*) into recenti
      from public.comments
     where author_id = new.author_id
       and created_at > now() - interval '10 minutes';

    if recenti >= 10 then
      -- PT429: PostgREST risponde 429 e il portale mostra un messaggio dedicato.
      raise exception 'Troppi commenti in poco tempo. Riprova fra qualche minuto.'
        using errcode = 'PT429';
    end if;

    if recenti >= 4 then
      motivi := array_append(motivi, 'molti commenti in pochi minuti');
    end if;

    -- Stesso testo gia' inviato nelle ultime 24 ore, anche sotto un altro articolo.
    if exists (
      select 1 from public.comments
       where author_id = new.author_id
         and created_at > now() - interval '24 hours'
         and lower(unaccent(body)) = normalizzato
    ) then
      motivi := array_append(motivi, 'testo già inviato');
    end if;
  end if;

  -- Link: tre o piu' sono quasi sempre promozione; anche uno solo, da un
  -- account nato da meno di un giorno, e' lo schema classico dello spam.
  select count(*) into link
    from regexp_matches(testo, '(https?://|www\.)', 'gi');

  if link >= 3 then
    motivi := array_append(motivi, format('%s link', link));
  elsif link > 0 and new.author_id is not null then
    select u.created_at into iscritto_il from auth.users u where u.id = new.author_id;
    if iscritto_il > now() - interval '24 hours' then
      motivi := array_append(motivi, 'link da un account appena creato');
    end if;
  end if;

  -- Tutto maiuscolo, su un testo abbastanza lungo da non essere una sigla.
  lettere := char_length(regexp_replace(testo, '[^[:alpha:]]', '', 'g'));
  maiuscole := char_length(regexp_replace(testo, '[^[:upper:]]', '', 'g'));
  if lettere >= 20 and maiuscole::numeric / lettere > 0.7 then
    motivi := array_append(motivi, 'scritto tutto in maiuscolo');
  end if;

  if testo ~ '(.)\1{9,}' then
    motivi := array_append(motivi, 'caratteri ripetuti');
  end if;

  -- Termini della redazione, come parole intere: "porto" non scatta in "rapporto".
  for termine in select t.term from public.moderation_terms t loop
    if normalizzato ~ ('\m' || regexp_replace(lower(unaccent(termine)), '([.^$|()\[\]{}*+?\\-])', '\\\1', 'g') || '\M') then
      motivi := array_append(motivi, format('contiene «%s»', termine));
      exit; -- uno basta: l'elenco intero nel motivo non aiuta chi modera
    end if;
  end loop;

  if array_length(motivi, 1) > 0 then
    new.auto_flagged := true;
    new.auto_flag_reason := array_to_string(motivi, ' · ');
  end if;

  return new;
end;
$$;

drop trigger if exists comments_antispam on public.comments;
create trigger comments_antispam
  before insert or update of body on public.comments
  for each row execute function public.regole_antispam();
