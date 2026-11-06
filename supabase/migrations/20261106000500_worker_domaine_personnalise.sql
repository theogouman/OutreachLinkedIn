-- @production-uniquement : nécessite pg_cron, pg_net et Vault (Supabase) ; ignorée par les tests.
-- Le worker est appelé sur le domaine de production outreach.gouman.fr.
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'worker-tick'),
  command := $$
  select net.http_post(
    url := 'https://outreach.gouman.fr/api/worker/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
