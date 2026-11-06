-- La fonction de contrôle d'accès ne doit pas être appelable via l'API REST
-- (/rest/v1/rpc). On la déplace dans un schéma non exposé ; les politiques RLS
-- qui l'utilisent restent valides (elles la référencent par identifiant interne).
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter function public.est_autorise() set schema private;
