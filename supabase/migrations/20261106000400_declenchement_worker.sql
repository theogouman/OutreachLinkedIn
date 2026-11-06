-- @production-uniquement : nécessite pg_cron, pg_net et Vault (Supabase) ; ignorée par les tests.
-- Déclenchement du worker : pg_cron appelle /api/worker/tick chaque minute (pg_net).
-- Le secret est généré dans le coffre Supabase (Vault) et n'apparaît ni dans le code
-- ni dans les journaux ; il doit être recopié dans Vercel (variable WORKER_SECRET).
-- Appliqué uniquement sur le projet Supabase de production (pas dans les tests).
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'worker_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'worker_secret', 'Secret Bearer de /api/worker/tick');
  end if;
end
$$;

select cron.schedule(
  'worker-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://outreach-linkedin-g0uman.vercel.app/api/worker/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
