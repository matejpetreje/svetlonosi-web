-- ============================================================
-- SVĚTLONOŠI / JISKRY
-- BADGE OVERLAY V1
--
-- Aktivní odznak u avataru:
-- - veřejný profil
-- - Síň slávy
-- - vlastní Jiskry profil
--
-- Spusť jako NOVÝ query v Supabase SQL Editoru.
-- ============================================================

create or replace function public.spark_badges_for_usernames(
  p_usernames text[]
)
returns table (
  kick_username text,
  variant_id uuid,
  variant_name text,
  preview_glyph text,
  preview_static_url text,
  preview_animated_url text,
  accent_key text,
  rarity text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Musíš být přihlášený.';
  end if;

  return query
  select
    sp.kick_username,
    v.id,
    v.name,
    v.preview_glyph,
    v.preview_static_url,
    v.preview_animated_url,
    v.accent_key,
    v.rarity
  from public.spark_profiles sp
  join public.spark_user_equipped e
    on e.user_id = sp.user_id
   and e.slot_type = 'badge'
  join public.spark_cosmetic_variants v
    on v.id = e.variant_id
  join public.spark_cosmetic_products p
    on p.id = v.product_id
  where
    sp.kick_username = any(p_usernames)
    and coalesce(sp.public_profile_enabled,true) = true
    and p.enabled = true
    and v.enabled = true;
end;
$$;

revoke all
on function public.spark_badges_for_usernames(text[])
from public, anon;

grant execute
on function public.spark_badges_for_usernames(text[])
to authenticated;

-- Kontrola existence funkce
select
  routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'spark_badges_for_usernames';
