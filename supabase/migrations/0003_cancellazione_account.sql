-- =============================================================================
-- Esperia — esecuzione delle cancellazioni account (RF-C-07)
--
-- 0001 toglie `anonymize_user` a public, anon e authenticated, e conta sul
-- fatto che Supabase conceda per impostazione predefinita l'esecuzione delle
-- funzioni di `public` anche a service_role. Il job del backoffice dipende da
-- quel permesso: qui lo rendiamo esplicito, cosi' non si regge su un default
-- che un progetto configurato a mano potrebbe non avere.
--
-- Va eseguita dopo 0001; non dipende dal CMS.
-- =============================================================================

grant execute on function public.anonymize_user(uuid) to service_role;

-- Il job cerca le richieste ogni ora: poche righe in una tabella che cresce.
create index if not exists profiles_deletion_requested_idx
  on public.profiles (deletion_requested_at)
  where deletion_requested_at is not null;
