-- =====================================================================
-- REMINDERS – runs every minute and asks the app to send due reminders.
-- 1. Replace YOUR-APP.vercel.app with your Vercel address
-- 2. Replace YOUR_CRON_SECRET with the CRON_SECRET you put in Vercel
-- 3. Run in Supabase → SQL Editor
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- (Re)create the job
select cron.unschedule('everything-reminders')
where exists (select 1 from cron.job where jobname = 'everything-reminders');

select cron.schedule(
  'everything-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://YOUR-APP.vercel.app/api/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR_CRON_SECRET'),
    body    := '{}'::jsonb
  );
  $$
);
