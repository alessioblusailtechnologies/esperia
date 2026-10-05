-- =============================================================================
-- Esperia — esecuzione delle cancellazioni account (RF-C-07)
--
-- Il job del backoffice esegue `anonymize_user` con la chiave di servizio. La
-- 0001 concede gia' il permesso a service_role; qui resta ripetuto per i
-- database su cui la 0001 era stata applicata prima che lo facesse.
--
-- Va eseguita dopo 0001; non dipende dal CMS.
-- =============================================================================

grant execute on function esperia.anonymize_user(uuid) to service_role;

-- Il job cerca le richieste ogni ora: poche righe in una tabella che cresce.
create index if not exists profiles_deletion_requested_idx
  on esperia.profiles (deletion_requested_at)
  where deletion_requested_at is not null;
