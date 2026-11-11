-- Centre de notifications (alertes de l'outil : compte LinkedIn déconnecté, d'autres à venir)
-- et notifications Push (PWA) vers les appareils abonnés.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type ~ '^[a-z_]{3,50}$'),
  niveau text not null default 'info' check (niveau in ('info', 'alerte')),
  titre text not null check (length(titre) between 1 and 200),
  corps text check (length(corps) <= 1000),
  -- Lien interne uniquement (chemin du site), jamais une adresse externe.
  lien text check (lien is null or lien ~ '^/([A-Za-z0-9_?=&%.-][A-Za-z0-9/_?=&%.-]*)?$'),
  lue boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_recentes_idx on public.notifications (created_at desc);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (lue) on public.notifications to authenticated;
create policy notifications_lecture on public.notifications for select to authenticated
  using (private.est_autorise());
create policy notifications_lue on public.notifications for update to authenticated
  using (private.est_autorise()) with check (private.est_autorise());

-- Abonnements Push des appareils (écrits par le serveur seulement).
create table public.abonnements_push (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) <= 200),
  auth text not null check (length(auth) <= 100),
  created_at timestamptz not null default now()
);
alter table public.abonnements_push enable row level security;
revoke all on public.abonnements_push from anon, authenticated;

-- Clés VAPID (signature des envois Push) : générées par le serveur au premier besoin, gardées dans
-- le schéma privé (non exposé par l'API), jamais dans le code ni dans les variables d'environnement.
create table private.cles_push (
  id boolean primary key default true check (id),
  publique text not null,
  privee text not null,
  created_at timestamptz not null default now()
);
revoke all on private.cles_push from public, anon, authenticated;
