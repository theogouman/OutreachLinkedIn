-- Hook Supabase Auth « Before User Created » : refuse la création de tout compte
-- dont l'adresse n'est pas dans utilisateurs_autorises (y compris via Google).
-- À activer dans le dashboard : Authentication → Hooks → Before User Created →
-- Postgres → public.hook_avant_creation_utilisateur.
create function public.hook_avant_creation_utilisateur(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.utilisateurs_autorises
    where email = lower(coalesce(event -> 'user' ->> 'email', ''))
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object('http_code', 403, 'message', 'Accès refusé.')
  );
end;
$$;

-- Appelable uniquement par le service d'authentification, jamais via l'API.
revoke all on function public.hook_avant_creation_utilisateur(jsonb) from public, anon, authenticated;
grant execute on function public.hook_avant_creation_utilisateur(jsonb) to supabase_auth_admin;
