-- ============================================================
-- SVĚTLONOŠI / JISKRY
-- OBCHOD + INVENTÁŘ + HODNOSTNÍ ODZNAKY V1
--
-- Spusť jako NOVÝ query v Supabase SQL Editoru.
-- Je to ADDITIVNÍ migrace: nemaže spark_profiles, transakce ani Jiskry.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1) PRODUKTY
--    "Produkt" = rodina kosmetiky, např. Rámeček Strážce.
-- ------------------------------------------------------------
create table if not exists public.spark_cosmetic_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  cosmetic_type text not null
    check (cosmetic_type in ('badge','frame','background','effect','title')),
  category text not null default 'Kosmetika',
  shop_visible boolean not null default true,
  enabled boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2) VARIANTY
--    Každý čtvercový slot v obchodě / inventáři je konkrétní varianta.
--    preview_animated_url je volitelná animace pro hover.
-- ------------------------------------------------------------
create table if not exists public.spark_cosmetic_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  slug text not null,
  name text not null,
  price integer not null default 0 check (price >= 0),

  unlock_type text not null default 'shop'
    check (unlock_type in ('shop','rank','event','admin')),

  unlock_threshold integer
    check (unlock_threshold is null or unlock_threshold >= 0),

  preview_glyph text not null default '✦',
  preview_static_url text,
  preview_animated_url text,
  accent_key text not null default 'gold',

  rarity text not null default 'common'
    check (rarity in ('common','uncommon','rare','epic','legendary')),

  enabled boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint spark_cosmetic_variants_product_fk
    foreign key (product_id)
    references public.spark_cosmetic_products(id)
    on delete cascade,

  constraint spark_cosmetic_variants_product_slug_unique
    unique (product_id, slug)
);

-- ------------------------------------------------------------
-- 3) INVENTÁŘ
-- ------------------------------------------------------------
create table if not exists public.spark_user_inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  variant_id uuid not null,
  acquired_via text not null default 'shop'
    check (acquired_via in ('shop','rank','event','admin')),
  acquired_at timestamptz not null default now(),

  constraint spark_user_inventory_user_fk
    foreign key (user_id)
    references auth.users(id)
    on delete cascade,

  constraint spark_user_inventory_variant_fk
    foreign key (variant_id)
    references public.spark_cosmetic_variants(id)
    on delete cascade,

  constraint spark_user_inventory_unique
    unique (user_id, variant_id)
);

-- ------------------------------------------------------------
-- 4) AKTIVNÍ KOSMETIKA
--    Pro každý typ může být aktivní právě jedna varianta.
-- ------------------------------------------------------------
create table if not exists public.spark_user_equipped (
  user_id uuid not null,
  slot_type text not null
    check (slot_type in ('badge','frame','background','effect','title')),
  variant_id uuid not null,
  equipped_at timestamptz not null default now(),

  primary key (user_id, slot_type),

  constraint spark_user_equipped_user_fk
    foreign key (user_id)
    references auth.users(id)
    on delete cascade,

  constraint spark_user_equipped_variant_fk
    foreign key (variant_id)
    references public.spark_cosmetic_variants(id)
    on delete cascade
);

create index if not exists spark_cosmetic_products_type_idx
  on public.spark_cosmetic_products(cosmetic_type, enabled, sort_order);

create index if not exists spark_cosmetic_variants_product_idx
  on public.spark_cosmetic_variants(product_id, enabled, sort_order);

create index if not exists spark_user_inventory_user_idx
  on public.spark_user_inventory(user_id, acquired_at desc);

create index if not exists spark_user_equipped_user_idx
  on public.spark_user_equipped(user_id);

-- ------------------------------------------------------------
-- 5) UPDATED_AT
-- ------------------------------------------------------------
drop trigger if exists spark_cosmetic_products_updated_at
  on public.spark_cosmetic_products;

create trigger spark_cosmetic_products_updated_at
before update on public.spark_cosmetic_products
for each row execute function public.set_updated_at();


drop trigger if exists spark_cosmetic_variants_updated_at
  on public.spark_cosmetic_variants;

create trigger spark_cosmetic_variants_updated_at
before update on public.spark_cosmetic_variants
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 6) RLS
-- ------------------------------------------------------------
alter table public.spark_cosmetic_products enable row level security;
alter table public.spark_cosmetic_variants enable row level security;
alter table public.spark_user_inventory enable row level security;
alter table public.spark_user_equipped enable row level security;

-- Katalog může vidět kdokoliv. Uživatelská data ne.
drop policy if exists "spark_cosmetic_products_read" on public.spark_cosmetic_products;
create policy "spark_cosmetic_products_read"
on public.spark_cosmetic_products
for select
using (enabled = true or public.is_dm());

drop policy if exists "spark_cosmetic_variants_read" on public.spark_cosmetic_variants;
create policy "spark_cosmetic_variants_read"
on public.spark_cosmetic_variants
for select
using (enabled = true or public.is_dm());

drop policy if exists "spark_cosmetic_products_dm_all" on public.spark_cosmetic_products;
create policy "spark_cosmetic_products_dm_all"
on public.spark_cosmetic_products
for all
using (public.is_dm())
with check (public.is_dm());

drop policy if exists "spark_cosmetic_variants_dm_all" on public.spark_cosmetic_variants;
create policy "spark_cosmetic_variants_dm_all"
on public.spark_cosmetic_variants
for all
using (public.is_dm())
with check (public.is_dm());

drop policy if exists "spark_user_inventory_self_read" on public.spark_user_inventory;
create policy "spark_user_inventory_self_read"
on public.spark_user_inventory
for select
using (auth.uid() = user_id or public.is_dm());

drop policy if exists "spark_user_inventory_dm_all" on public.spark_user_inventory;
create policy "spark_user_inventory_dm_all"
on public.spark_user_inventory
for all
using (public.is_dm())
with check (public.is_dm());

-- Vybavenou kosmetiku smí vidět přihlášení členové komunity.
-- Měnit ji může uživatel jen přes RPC níže.
drop policy if exists "spark_user_equipped_authenticated_read" on public.spark_user_equipped;
create policy "spark_user_equipped_authenticated_read"
on public.spark_user_equipped
for select
to authenticated
using (true);

drop policy if exists "spark_user_equipped_dm_all" on public.spark_user_equipped;
create policy "spark_user_equipped_dm_all"
on public.spark_user_equipped
for all
using (public.is_dm())
with check (public.is_dm());

-- ------------------------------------------------------------
-- 7) SEED: HODNOSTNÍ BADGE
--    Nejsou v obchodě. Odemknou se lifetime postupem.
-- ------------------------------------------------------------
insert into public.spark_cosmetic_products
  (slug,name,description,cosmetic_type,category,shop_visible,enabled,sort_order)
values
  (
    'rank-badges',
    'Hodnostní odznaky',
    'Odznaky odemykané automaticky podle všech získaných Jisker.',
    'badge',
    'Hodnosti',
    false,
    true,
    10
  )
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  cosmetic_type = excluded.cosmetic_type,
  category = excluded.category,
  shop_visible = excluded.shop_visible,
  enabled = excluded.enabled,
  sort_order = excluded.sort_order;

with p as (
  select id
  from public.spark_cosmetic_products
  where slug = 'rank-badges'
)
insert into public.spark_cosmetic_variants
  (
    product_id,slug,name,price,unlock_type,unlock_threshold,
    preview_glyph,accent_key,rarity,enabled,sort_order
  )
select p.id, v.slug, v.name, 0, 'rank', v.threshold,
       v.glyph, v.accent, v.rarity, true, v.sort_order
from p
cross join (
  values
    ('zbloudila-jiskra','Zbloudilá jiskra',0,'✦','ash','common',10),
    ('jiskra','Jiskra',100,'✧','gold','common',20),
    ('plaminek','Plamínek',300,'♨','ember','uncommon',30),
    ('pochoden','Pochodeň',750,'🔥','ember','uncommon',40),
    ('svetlonos','Světlonoš',1500,'☀','gold','rare',50),
    ('strazce-plamene','Strážce plamene',3000,'◆','ember','rare',60),
    ('nositel-svetla','Nositel světla',6000,'✺','light','epic',70),
    ('vecny-plamen','Věčný plamen',10000,'✹','legendary','legendary',80),
    ('majak-svetlonosu','Maják Světlonošů',20000,'✷','light','legendary',90)
) as v(slug,name,threshold,glyph,accent,rarity,sort_order)
on conflict (product_id,slug) do update set
  name = excluded.name,
  price = excluded.price,
  unlock_type = excluded.unlock_type,
  unlock_threshold = excluded.unlock_threshold,
  preview_glyph = excluded.preview_glyph,
  accent_key = excluded.accent_key,
  rarity = excluded.rarity,
  enabled = excluded.enabled,
  sort_order = excluded.sort_order;

-- ------------------------------------------------------------
-- 8) SEED: PRVNÍ PRODUKTY OBCHODU
--    Preview obrázky lze později doplnit bez změny frontendu.
-- ------------------------------------------------------------
insert into public.spark_cosmetic_products
  (slug,name,description,cosmetic_type,category,shop_visible,enabled,sort_order)
values
  (
    'ramecek-strazce',
    'Rámeček Strážce',
    'Kovový fantasy rámeček pro avatar. Vyber si jednu z barevných variant.',
    'frame',
    'Rámečky',
    true,
    true,
    100
  ),
  (
    'aura-jiskry',
    'Aura Jiskry',
    'Jemný animovaný efekt kolem profilu a avatara.',
    'effect',
    'Efekty',
    true,
    true,
    200
  ),
  (
    'pozadi-kroniky',
    'Pozadí kroniky',
    'Tematické pozadí veřejné profilové karty.',
    'background',
    'Pozadí',
    true,
    true,
    300
  ),
  (
    'runovy-odznak',
    'Runový odznak',
    'Kosmetický odznak nezávislý na hodnosti.',
    'badge',
    'Odznaky',
    true,
    true,
    400
  )
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  cosmetic_type = excluded.cosmetic_type,
  category = excluded.category,
  shop_visible = excluded.shop_visible,
  enabled = excluded.enabled,
  sort_order = excluded.sort_order;

-- Rámečky
with p as (
  select id from public.spark_cosmetic_products where slug='ramecek-strazce'
)
insert into public.spark_cosmetic_variants
  (product_id,slug,name,price,unlock_type,preview_glyph,accent_key,rarity,enabled,sort_order)
select p.id,v.slug,v.name,650,'shop','◇',v.accent,v.rarity,true,v.sort_order
from p
cross join (
  values
    ('jantar','Jantar', 'gold','uncommon',10),
    ('safir','Safír', 'blue','uncommon',20),
    ('smaragd','Smaragd', 'green','uncommon',30),
    ('ametyst','Ametyst', 'purple','rare',40)
) as v(slug,name,accent,rarity,sort_order)
on conflict (product_id,slug) do update set
  name=excluded.name, price=excluded.price, unlock_type=excluded.unlock_type,
  preview_glyph=excluded.preview_glyph, accent_key=excluded.accent_key,
  rarity=excluded.rarity, enabled=excluded.enabled, sort_order=excluded.sort_order;

-- Aury
with p as (
  select id from public.spark_cosmetic_products where slug='aura-jiskry'
)
insert into public.spark_cosmetic_variants
  (product_id,slug,name,price,unlock_type,preview_glyph,accent_key,rarity,enabled,sort_order)
select p.id,v.slug,v.name,800,'shop','✦',v.accent,'rare',true,v.sort_order
from p
cross join (
  values
    ('zlata','Zlatá', 'gold',10),
    ('ledova','Ledová', 'blue',20),
    ('rudá','Rudá', 'red',30),
    ('fialova','Fialová', 'purple',40)
) as v(slug,name,accent,sort_order)
on conflict (product_id,slug) do update set
  name=excluded.name, price=excluded.price, unlock_type=excluded.unlock_type,
  preview_glyph=excluded.preview_glyph, accent_key=excluded.accent_key,
  rarity=excluded.rarity, enabled=excluded.enabled, sort_order=excluded.sort_order;

-- Pozadí
with p as (
  select id from public.spark_cosmetic_products where slug='pozadi-kroniky'
)
insert into public.spark_cosmetic_variants
  (product_id,slug,name,price,unlock_type,preview_glyph,accent_key,rarity,enabled,sort_order)
select p.id,v.slug,v.name,1000,'shop','▣',v.accent,'rare',true,v.sort_order
from p
cross join (
  values
    ('dungeon','Dungeon', 'gold',10),
    ('nocni-mlha','Noční mlha', 'blue',20),
    ('krvavy-mesic','Krvavý měsíc', 'red',30),
    ('arcane','Arcane', 'purple',40)
) as v(slug,name,accent,sort_order)
on conflict (product_id,slug) do update set
  name=excluded.name, price=excluded.price, unlock_type=excluded.unlock_type,
  preview_glyph=excluded.preview_glyph, accent_key=excluded.accent_key,
  rarity=excluded.rarity, enabled=excluded.enabled, sort_order=excluded.sort_order;

-- Runové odznaky
with p as (
  select id from public.spark_cosmetic_products where slug='runovy-odznak'
)
insert into public.spark_cosmetic_variants
  (product_id,slug,name,price,unlock_type,preview_glyph,accent_key,rarity,enabled,sort_order)
select p.id,v.slug,v.name,500,'shop',v.glyph,v.accent,'uncommon',true,v.sort_order
from p
cross join (
  values
    ('slunce','Slunce','☀','gold',10),
    ('mesic','Měsíc','☾','blue',20),
    ('runa','Runa','ᚱ','purple',30),
    ('oko','Oko','◉','red',40)
) as v(slug,name,glyph,accent,sort_order)
on conflict (product_id,slug) do update set
  name=excluded.name, price=excluded.price, unlock_type=excluded.unlock_type,
  preview_glyph=excluded.preview_glyph, accent_key=excluded.accent_key,
  rarity=excluded.rarity, enabled=excluded.enabled, sort_order=excluded.sort_order;

-- ------------------------------------------------------------
-- 9) AUTOMATICKÉ ODEMYKÁNÍ HODNOSTNÍCH BADGE
-- ------------------------------------------------------------
create or replace function public.spark_grant_rank_badges_for_user(
  p_user_id uuid,
  p_lifetime integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.spark_user_inventory
    (user_id,variant_id,acquired_via)
  select
    p_user_id,
    v.id,
    'rank'
  from public.spark_cosmetic_variants v
  join public.spark_cosmetic_products p
    on p.id = v.product_id
  where
    p.cosmetic_type = 'badge'
    and v.unlock_type = 'rank'
    and v.enabled = true
    and coalesce(v.unlock_threshold,0) <= greatest(coalesce(p_lifetime,0),0)
  on conflict (user_id,variant_id) do nothing;
end;
$$;

create or replace function public.spark_profiles_grant_rank_badges_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.spark_grant_rank_badges_for_user(
    new.user_id,
    new.lifetime_earned
  );
  return new;
end;
$$;

drop trigger if exists spark_profiles_rank_badges
  on public.spark_profiles;

create trigger spark_profiles_rank_badges
after insert or update of lifetime_earned
on public.spark_profiles
for each row
execute function public.spark_profiles_grant_rank_badges_trigger();

-- Backfill pro už existující účty.
do $$
declare
  r record;
begin
  for r in
    select user_id,lifetime_earned
    from public.spark_profiles
  loop
    perform public.spark_grant_rank_badges_for_user(
      r.user_id,
      r.lifetime_earned
    );
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- 10) KATALOG OBCHODU
-- ------------------------------------------------------------
create or replace function public.spark_shop_catalog()
returns table (
  product_id uuid,
  product_slug text,
  product_name text,
  product_description text,
  cosmetic_type text,
  category text,
  variant_id uuid,
  variant_slug text,
  variant_name text,
  price integer,
  preview_glyph text,
  preview_static_url text,
  preview_animated_url text,
  accent_key text,
  rarity text,
  owned boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.slug,
    p.name,
    p.description,
    p.cosmetic_type,
    p.category,
    v.id,
    v.slug,
    v.name,
    v.price,
    v.preview_glyph,
    v.preview_static_url,
    v.preview_animated_url,
    v.accent_key,
    v.rarity,
    exists(
      select 1
      from public.spark_user_inventory i
      where
        i.user_id = auth.uid()
        and i.variant_id = v.id
    ) as owned
  from public.spark_cosmetic_products p
  join public.spark_cosmetic_variants v
    on v.product_id = p.id
  where
    p.enabled = true
    and p.shop_visible = true
    and v.enabled = true
    and v.unlock_type = 'shop'
  order by p.sort_order,v.sort_order,p.name,v.name;
$$;

grant execute on function public.spark_shop_catalog()
to anon, authenticated;

-- ------------------------------------------------------------
-- 11) MŮJ INVENTÁŘ
-- ------------------------------------------------------------
create or replace function public.spark_my_inventory()
returns table (
  product_id uuid,
  product_slug text,
  product_name text,
  product_description text,
  cosmetic_type text,
  category text,
  variant_id uuid,
  variant_slug text,
  variant_name text,
  price integer,
  unlock_type text,
  unlock_threshold integer,
  preview_glyph text,
  preview_static_url text,
  preview_animated_url text,
  accent_key text,
  rarity text,
  acquired_via text,
  acquired_at timestamptz,
  equipped boolean
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
    p.id,
    p.slug,
    p.name,
    p.description,
    p.cosmetic_type,
    p.category,
    v.id,
    v.slug,
    v.name,
    v.price,
    v.unlock_type,
    v.unlock_threshold,
    v.preview_glyph,
    v.preview_static_url,
    v.preview_animated_url,
    v.accent_key,
    v.rarity,
    i.acquired_via,
    i.acquired_at,
    exists(
      select 1
      from public.spark_user_equipped e
      where
        e.user_id = auth.uid()
        and e.slot_type = p.cosmetic_type
        and e.variant_id = v.id
    )
  from public.spark_user_inventory i
  join public.spark_cosmetic_variants v
    on v.id = i.variant_id
  join public.spark_cosmetic_products p
    on p.id = v.product_id
  where
    i.user_id = auth.uid()
    and p.enabled = true
    and v.enabled = true
  order by
    case p.cosmetic_type
      when 'badge' then 10
      when 'frame' then 20
      when 'background' then 30
      when 'effect' then 40
      when 'title' then 50
      else 99
    end,
    v.unlock_threshold nulls last,
    p.sort_order,
    v.sort_order;
end;
$$;

grant execute on function public.spark_my_inventory()
to authenticated;

-- ------------------------------------------------------------
-- 12) KOUPĚ VARIANTY
-- ------------------------------------------------------------
create or replace function public.spark_buy_variant(
  p_variant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_variant public.spark_cosmetic_variants;
  v_product public.spark_cosmetic_products;
  v_profile public.spark_profiles;
begin
  if v_uid is null then
    raise exception 'Musíš být přihlášený.';
  end if;

  select *
  into v_variant
  from public.spark_cosmetic_variants
  where id = p_variant_id
  for update;

  if v_variant.id is null
     or v_variant.enabled = false
     or v_variant.unlock_type <> 'shop' then
    raise exception 'Tato varianta není dostupná v obchodě.';
  end if;

  select *
  into v_product
  from public.spark_cosmetic_products
  where id = v_variant.product_id;

  if v_product.id is null
     or v_product.enabled = false
     or v_product.shop_visible = false then
    raise exception 'Tento produkt není dostupný v obchodě.';
  end if;

  if exists(
    select 1
    from public.spark_user_inventory
    where user_id = v_uid
      and variant_id = p_variant_id
  ) then
    raise exception 'Tuto variantu už vlastníš.';
  end if;

  select *
  into v_profile
  from public.spark_profiles
  where user_id = v_uid
  for update;

  if v_profile.user_id is null then
    raise exception 'Profil Jisker nebyl nalezen.';
  end if;

  if v_profile.balance < v_variant.price then
    raise exception 'Nemáš dost Jisker.';
  end if;

  update public.spark_profiles
  set
    balance = balance - v_variant.price,
    updated_at = now()
  where user_id = v_uid
  returning * into v_profile;

  insert into public.spark_user_inventory
    (user_id,variant_id,acquired_via)
  values
    (v_uid,p_variant_id,'shop');

  insert into public.spark_transactions
    (
      user_id,
      amount,
      balance_after,
      reason,
      source_type,
      source_key
    )
  values
    (
      v_uid,
      -v_variant.price,
      v_profile.balance,
      'Nákup v Obchodě Jisker: ' || v_product.name || ' — ' || v_variant.name,
      'shop_purchase',
      p_variant_id::text
    );

  return jsonb_build_object(
    'ok', true,
    'balance', v_profile.balance,
    'variant_id', v_variant.id,
    'product_name', v_product.name,
    'variant_name', v_variant.name,
    'price', v_variant.price
  );
end;
$$;

grant execute on function public.spark_buy_variant(uuid)
to authenticated;

-- ------------------------------------------------------------
-- 13) VYBAVENÍ KOSMETIKY
--     Žádná fajfka v UI není potřeba; DB drží pouze aktivní slot.
-- ------------------------------------------------------------
create or replace function public.spark_equip_variant(
  p_variant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_variant public.spark_cosmetic_variants;
  v_product public.spark_cosmetic_products;
begin
  if v_uid is null then
    raise exception 'Musíš být přihlášený.';
  end if;

  select *
  into v_variant
  from public.spark_cosmetic_variants
  where id = p_variant_id;

  if v_variant.id is null or v_variant.enabled = false then
    raise exception 'Kosmetika nebyla nalezena.';
  end if;

  select *
  into v_product
  from public.spark_cosmetic_products
  where id = v_variant.product_id;

  if v_product.id is null or v_product.enabled = false then
    raise exception 'Kosmetika nebyla nalezena.';
  end if;

  if not exists(
    select 1
    from public.spark_user_inventory
    where user_id = v_uid
      and variant_id = p_variant_id
  ) then
    raise exception 'Tuto kosmetiku nevlastníš.';
  end if;

  insert into public.spark_user_equipped
    (user_id,slot_type,variant_id,equipped_at)
  values
    (v_uid,v_product.cosmetic_type,p_variant_id,now())
  on conflict (user_id,slot_type)
  do update set
    variant_id = excluded.variant_id,
    equipped_at = now();

  -- Kompatibilita se současným veřejným profilem.
  if v_product.cosmetic_type = 'badge' then
    update public.spark_profiles
    set active_badge = v_variant.name,
        updated_at = now()
    where user_id = v_uid;

  elsif v_product.cosmetic_type = 'frame' then
    update public.spark_profiles
    set active_frame = v_variant.name,
        updated_at = now()
    where user_id = v_uid;

  elsif v_product.cosmetic_type = 'title' then
    update public.spark_profiles
    set profile_title = v_variant.name,
        updated_at = now()
    where user_id = v_uid;
  end if;

  return jsonb_build_object(
    'ok', true,
    'slot_type', v_product.cosmetic_type,
    'variant_id', v_variant.id,
    'name', v_variant.name
  );
end;
$$;

grant execute on function public.spark_equip_variant(uuid)
to authenticated;

-- ------------------------------------------------------------
-- 14) AKTIVNÍ KOSMETIKA VEŘEJNÉHO PROFILU
--     Přístup pouze po přihlášení, stejně jako Síň slávy.
-- ------------------------------------------------------------
create or replace function public.spark_profile_equipped(
  p_username text
)
returns table (
  slot_type text,
  variant_id uuid,
  product_name text,
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
declare
  v_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Musíš být přihlášený.';
  end if;

  select sp.user_id
  into v_user_id
  from public.spark_profiles sp
  where lower(sp.kick_username) = lower(trim(p_username))
    and coalesce(sp.public_profile_enabled,true) = true
  limit 1;

  if v_user_id is null then
    return;
  end if;

  return query
  select
    e.slot_type,
    v.id,
    p.name,
    v.name,
    v.preview_glyph,
    v.preview_static_url,
    v.preview_animated_url,
    v.accent_key,
    v.rarity
  from public.spark_user_equipped e
  join public.spark_cosmetic_variants v
    on v.id = e.variant_id
  join public.spark_cosmetic_products p
    on p.id = v.product_id
  where e.user_id = v_user_id
    and p.enabled = true
    and v.enabled = true
  order by e.slot_type;
end;
$$;

grant execute on function public.spark_profile_equipped(text)
to authenticated;

-- ------------------------------------------------------------
-- 15) KONTROLA
-- ------------------------------------------------------------
select
  p.name as produkt,
  p.cosmetic_type as typ,
  v.name as varianta,
  v.unlock_type as odemknuti,
  v.unlock_threshold as lifetime,
  v.price as cena
from public.spark_cosmetic_products p
join public.spark_cosmetic_variants v
  on v.product_id = p.id
order by p.sort_order,v.sort_order;
