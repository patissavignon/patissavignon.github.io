-- =====================================================================
--  TROMPE L'ŒIL EVENT — Base de données Supabase
--  À coller en une seule fois dans : Supabase > SQL Editor > New query > Run
--
--  ⚠️  AVANT DE LANCER : remplacez  votre-email@exemple.com  (ligne ~95)
--      par l'adresse email avec laquelle VOUS vous connecterez au tableau de bord.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. RÉGLAGES (une seule ligne) : prix, offre, textes, photos d'en-tête
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id                int primary key default 1 check (id = 1),
  brand_name        text not null default 'Trompe l''Œil',
  brand_sub         text not null default 'EVENT',
  tagline           text not null default 'Pâtisseries trompe-l''œil et cupcakes floraux pour boulangeries, restaurants et traiteurs',
  -- Paliers du prix dégressif : à partir de "min" pièces → "price" € la pièce
  tiers             jsonb not null default '[{"min":1,"price":3.50},{"min":60,"price":3.20},{"min":151,"price":3.00}]',
  cupcake_price     numeric(8,2) not null default 3.30 check (cupcake_price >= 0),
  cupcake_min       int not null default 6 check (cupcake_min >= 1),
  promo_active      boolean not null default true,
  promo_title       text not null default 'Bouquet de 7 cupcakes',
  promo_size        int not null default 7 check (promo_size >= 1),
  promo_price       numeric(8,2) not null default 20 check (promo_price >= 0),
  custom_min        int not null default 6 check (custom_min >= 1),
  custom_max        int not null default 60 check (custom_max >= 1),
  tle_image_url     text,
  cupcake_image_url text,
  price_note        text not null default 'Prix HT · Livraison à convenir après validation',
  updated_at        timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- Ajouts version 2 (sans effet si les colonnes existent déjà)
alter table public.settings add column if not exists tle_min_per_flavor int not null default 5 check (tle_min_per_flavor >= 1);
alter table public.settings add column if not exists banner_active  boolean not null default true;
alter table public.settings add column if not exists banner_eyebrow text not null default 'Notre différence';
alter table public.settings add column if not exists banner_title   text not null default 'Le vrai fruit, au cœur de chaque pièce';
alter table public.settings add column if not exists banner_text    text not null default 'Nous achetons des fruits frais et les transformons nous-mêmes en inserts. Là où beaucoup utilisent des gels aromatisés, vous servez le goût du vrai fruit.';
alter table public.settings add column if not exists tle_video_url     text;
alter table public.settings add column if not exists cupcake_video_url text;
-- Carré prix du bandeau (texte libre ; prix du milieu vide = calculé automatiquement)
alter table public.settings add column if not exists banner_price_top    text not null default 'dès';
alter table public.settings add column if not exists banner_price_main   text not null default '';
alter table public.settings add column if not exists banner_price_bottom text not null default 'la pièce';
-- Pour chaque emplacement : afficher la photo ou la vidéo (au choix dans le tableau de bord)
alter table public.settings add column if not exists tle_media text not null default 'video' check (tle_media in ('photo','video'));
alter table public.settings add column if not exists cupcake_media text not null default 'photo' check (cupcake_media in ('photo','video'));

-- ---------------------------------------------------------------------
-- 2. PRODUITS : goûts de trompe-l'œil (classique / special)
--               et goûts d'insert des cupcakes (cupcake)
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  category    text not null check (category in ('classique','special','cupcake')),
  name        text not null check (length(trim(name)) between 1 and 60),
  color       text not null default '#C99459' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  image_url   text,
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists products_cat_idx on public.products (category, sort_order);

-- ---------------------------------------------------------------------
-- 3. COMMANDES (le numéro de commande = id)
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  status         text not null default 'nouvelle'
                 check (status in ('nouvelle','confirmee','livree','annulee')),
  business_name  text not null,
  contact_name   text,
  phone          text not null,
  email          text,
  delivery_date  date,
  message        text,
  items          jsonb not null,
  total          numeric(10,2) not null,
  admin_note     text
);
create index if not exists orders_created_idx on public.orders (created_at desc);

-- ---------------------------------------------------------------------
-- 4. PROPRIÉTAIRES autorisés à gérer le site
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  email text primary key
);

-- ⚠️ REMPLACEZ l'email ci-dessous par le vôtre :
insert into public.admins (email) values ('votre-email@exemple.com')
on conflict (email) do nothing;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select auth.role() = 'authenticated'
     and exists (
       select 1 from public.admins a
       where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     );
$$;

-- ---------------------------------------------------------------------
-- 5. SÉCURITÉ (Row Level Security)
--    Les clients lisent la carte. Seul le propriétaire modifie.
--    Les clients ne peuvent PAS lire les commandes des autres.
-- ---------------------------------------------------------------------
alter table public.settings enable row level security;
alter table public.products enable row level security;
alter table public.orders   enable row level security;
alter table public.admins   enable row level security;

drop policy if exists settings_read   on public.settings;
drop policy if exists settings_update on public.settings;
create policy settings_read   on public.settings for select to anon, authenticated using (true);
create policy settings_update on public.settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists products_read   on public.products;
drop policy if exists products_insert on public.products;
drop policy if exists products_update on public.products;
drop policy if exists products_delete on public.products;
create policy products_read   on public.products for select to anon, authenticated using (active or public.is_admin());
create policy products_insert on public.products for insert to authenticated with check (public.is_admin());
create policy products_update on public.products for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy products_delete on public.products for delete to authenticated using (public.is_admin());

drop policy if exists orders_select on public.orders;
drop policy if exists orders_update on public.orders;
drop policy if exists orders_delete on public.orders;
create policy orders_select on public.orders for select to authenticated using (public.is_admin());
create policy orders_update on public.orders for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy orders_delete on public.orders for delete to authenticated using (public.is_admin());
-- (pas de politique INSERT : les commandes passent uniquement par place_order ci-dessous)

drop policy if exists admins_select on public.admins;
create policy admins_select on public.admins for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- 6. PHOTOS (stockage public en lecture, écriture réservée au propriétaire)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 52428800, array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists photos_insert on storage.objects;
drop policy if exists photos_update on storage.objects;
drop policy if exists photos_delete on storage.objects;
create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.is_admin());
create policy photos_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.is_admin());
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.is_admin());

-- ---------------------------------------------------------------------
-- 7. PASSER UNE COMMANDE (appelée par la carte client)
--    Le total est RECALCULÉ ici avec les vrais prix de la base :
--    un client ne peut pas trafiquer les prix depuis son navigateur.
--
--    Format reçu :
--    { business_name, contact_name, phone, email, delivery_date, message,
--      tle:      [{product_id, qty}],
--      cupcakes: [{product_id, qty}],
--      bouquets: [{flavor, count}],              -- offre bouquet
--      custom:   [{flavor, pieces, count}] }     -- bouquet sur mesure
-- ---------------------------------------------------------------------
create or replace function public.place_order(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s          public.settings%rowtype;
  v_items    jsonb := '[]'::jsonb;
  v_total    numeric := 0;
  n_tle      int := 0;
  n_cup      int := 0;
  v_unit     numeric;
  v_flavors  text[];
  v_id       bigint;
  r          record;
  e          jsonb;
  v_cnt      int;
  v_pcs      int;
  v_fl       text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Commande invalide';
  end if;
  if length(p::text) > 20000 then
    raise exception 'Commande trop volumineuse';
  end if;
  if coalesce(trim(p->>'business_name'), '') = '' then
    raise exception 'Le nom de l''établissement est obligatoire';
  end if;
  if coalesce(trim(p->>'phone'), '') = '' then
    raise exception 'Le téléphone est obligatoire';
  end if;

  select * into s from public.settings where id = 1;

  -- Contrôle des quantités envoyées
  for e in select * from jsonb_array_elements(coalesce(p->'tle','[]'::jsonb) || coalesce(p->'cupcakes','[]'::jsonb)) loop
    if (e->>'qty') is null or (e->>'qty')::int < 0 or (e->>'qty')::int > 5000 then
      raise exception 'Quantité invalide';
    end if;
  end loop;

  -- Trompe-l'œil : total des pièces, tous goûts confondus → palier de prix
  select coalesce(sum((x->>'qty')::int), 0) into n_tle
  from jsonb_array_elements(coalesce(p->'tle','[]'::jsonb)) x
  join public.products pr
    on pr.id = (x->>'product_id')::uuid and pr.active and pr.category in ('classique','special');

  if n_tle > 0 then
    select (t->>'price')::numeric into v_unit
    from jsonb_array_elements(s.tiers) t
    where (t->>'min')::int <= n_tle
    order by (t->>'min')::int desc
    limit 1;
    if v_unit is null then
      select (t->>'price')::numeric into v_unit
      from jsonb_array_elements(s.tiers) t order by (t->>'min')::int asc limit 1;
    end if;

    for r in
      select pr.name, pr.category, pr.sort_order, sum((x->>'qty')::int) as qty
      from jsonb_array_elements(coalesce(p->'tle','[]'::jsonb)) x
      join public.products pr
        on pr.id = (x->>'product_id')::uuid and pr.active and pr.category in ('classique','special')
      group by pr.name, pr.category, pr.sort_order
      having sum((x->>'qty')::int) > 0
      order by pr.category, pr.sort_order
    loop
      if r.qty < s.tle_min_per_flavor then
        raise exception 'Trompe-l''œil % : minimum % pièces par goût', r.name, s.tle_min_per_flavor;
      end if;
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'type', 'trompe_loeil', 'label', 'Trompe-l''œil ' || r.name,
        'qty', r.qty, 'pieces', r.qty, 'unit_price', v_unit, 'total', round(r.qty * v_unit, 2)));
      v_total := v_total + r.qty * v_unit;
    end loop;
  end if;

  -- Cupcakes à la pièce
  for r in
    select pr.name, pr.sort_order, sum((x->>'qty')::int) as qty
    from jsonb_array_elements(coalesce(p->'cupcakes','[]'::jsonb)) x
    join public.products pr
      on pr.id = (x->>'product_id')::uuid and pr.active and pr.category = 'cupcake'
    group by pr.name, pr.sort_order
    having sum((x->>'qty')::int) > 0
    order by pr.sort_order
  loop
    n_cup := n_cup + r.qty;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'type', 'cupcake', 'label', 'Cupcake ' || r.name,
      'qty', r.qty, 'pieces', r.qty, 'unit_price', s.cupcake_price, 'total', round(r.qty * s.cupcake_price, 2)));
    v_total := v_total + r.qty * s.cupcake_price;
  end loop;
  if n_cup > 0 and n_cup < s.cupcake_min then
    raise exception 'Cupcakes à la pièce : minimum % pièces', s.cupcake_min;
  end if;

  select array_agg(name) into v_flavors
  from public.products where category = 'cupcake' and active;
  v_flavors := coalesce(v_flavors, '{}') || array['Assortiment'];

  -- Bouquets en offre
  for e in select * from jsonb_array_elements(coalesce(p->'bouquets','[]'::jsonb)) loop
    if not s.promo_active then raise exception 'L''offre bouquet n''est plus disponible'; end if;
    v_cnt := (e->>'count')::int;
    v_fl  := e->>'flavor';
    if v_cnt is null or v_cnt < 1 or v_cnt > 200 then raise exception 'Nombre de bouquets invalide'; end if;
    if not (v_fl = any(v_flavors)) then raise exception 'Goût inconnu : %', v_fl; end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'type', 'bouquet_offre', 'label', s.promo_title, 'detail', 'Insert : ' || v_fl,
      'qty', v_cnt, 'pieces', v_cnt * s.promo_size, 'unit_price', s.promo_price, 'total', round(v_cnt * s.promo_price, 2)));
    v_total := v_total + v_cnt * s.promo_price;
  end loop;

  -- Bouquets sur mesure
  for e in select * from jsonb_array_elements(coalesce(p->'custom','[]'::jsonb)) loop
    v_cnt := (e->>'count')::int;
    v_pcs := (e->>'pieces')::int;
    v_fl  := e->>'flavor';
    if v_cnt is null or v_cnt < 1 or v_cnt > 200 then raise exception 'Nombre de bouquets invalide'; end if;
    if v_pcs is null or v_pcs < s.custom_min or v_pcs > s.custom_max then
      raise exception 'Bouquet sur mesure : entre % et % pièces', s.custom_min, s.custom_max;
    end if;
    if not (v_fl = any(v_flavors)) then raise exception 'Goût inconnu : %', v_fl; end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'type', 'bouquet_mesure', 'label', 'Bouquet sur mesure · ' || v_pcs || ' pièces',
      'detail', 'Insert : ' || v_fl,
      'qty', v_cnt, 'pieces', v_cnt * v_pcs, 'unit_price', round(v_pcs * s.cupcake_price, 2),
      'total', round(v_cnt * v_pcs * s.cupcake_price, 2)));
    v_total := v_total + v_cnt * v_pcs * s.cupcake_price;
  end loop;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'La commande est vide';
  end if;

  insert into public.orders (business_name, contact_name, phone, email, delivery_date, message, items, total)
  values (
    left(trim(p->>'business_name'), 120),
    left(nullif(trim(p->>'contact_name'), ''), 120),
    left(trim(p->>'phone'), 40),
    left(nullif(trim(p->>'email'), ''), 160),
    nullif(p->>'delivery_date', '')::date,
    left(nullif(trim(p->>'message'), ''), 1000),
    v_items,
    round(v_total, 2)
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'total', round(v_total, 2), 'items', v_items);
end;
$$;

revoke all on function public.place_order(jsonb) from public;
grant execute on function public.place_order(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. DONNÉES DE DÉPART (votre carte actuelle)
-- ---------------------------------------------------------------------
insert into public.products (category, name, color, sort_order)
select * from (values
  ('classique', 'Cacahuète', '#C99459', 1),
  ('classique', 'Pistache',  '#9BB065', 2),
  ('classique', 'Cabosse',   '#B0602F', 3),
  ('classique', 'Pop-corn',  '#EBD49E', 4),
  ('classique', 'Fraise',    '#D33A44', 5),
  ('classique', 'Framboise', '#BE2C55', 6),
  ('classique', 'Mangue',    '#EFA236', 7),
  ('classique', 'Citron',    '#EDCF3A', 8),
  ('special',   'Passion',   '#7A4268', 1),
  ('special',   'Myrtille',  '#43508C', 2),
  ('special',   'Amande',    '#D8B587', 3),
  ('special',   'Ananas',    '#E5BC3E', 4),
  ('special',   'Banane',    '#F0D660', 5),
  ('cupcake',   'Nutella',   '#5A3420', 1),
  ('cupcake',   'Fraise',    '#D33A44', 2),
  ('cupcake',   'Spéculoos', '#B9783F', 3),
  ('cupcake',   'Caramel',   '#C98A3D', 4),
  ('cupcake',   'Mangue',    '#EFA236', 5)
) as v(category, name, color, sort_order)
where not exists (select 1 from public.products);
