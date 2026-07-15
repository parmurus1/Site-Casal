-- =========================================================
-- SCHEMA DO "NOSSO DIÁRIO"
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase
-- (Supabase → SQL Editor → New query → cole tudo → Run)
-- =========================================================

-- extensão pra gerar uuid
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- couple_info: dados do casal (data de início, nomes)
-- ---------------------------------------------------------
create table if not exists couple_info (
  id uuid primary key default gen_random_uuid(),
  start_date date not null default '2023-02-14',
  name_a text default 'Você',
  name_b text default 'Seu Amor',
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------
-- pages: cada linha é UMA página física (lado esquerdo ou
-- direito de uma "lombada"/spread). spread_index agrupa
-- duas páginas (left/right) que aparecem juntas.
-- ---------------------------------------------------------
create table if not exists pages (
  id uuid primary key default gen_random_uuid(),
  spread_index integer not null,
  side text not null check (side in ('left', 'right')),
  created_at timestamptz default now(),
  unique (spread_index, side)
);

-- ---------------------------------------------------------
-- elements: os itens soltos dentro de cada página
-- (texto, imagem, áudio, vídeo) — posição livre tipo Canva
-- ---------------------------------------------------------
create table if not exists elements (
  id uuid primary key default gen_random_uuid(),
  page_id uuid references pages(id) on delete cascade,
  type text not null check (type in ('text', 'image', 'audio', 'video')),
  content text,                 -- texto puro OU url da mídia
  x numeric not null default 8,      -- posição em % da página
  y numeric not null default 10,
  width numeric not null default 80, -- tamanho em % da página
  height numeric not null default 30,
  rotation numeric not null default 0,
  z_index integer not null default 1,
  font_size numeric default 22,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- RLS: leitura pública (é o "diário aberto"), escrita só
-- pra quem estiver autenticado (vocês dois)
-- ---------------------------------------------------------
alter table couple_info enable row level security;
alter table pages enable row level security;
alter table elements enable row level security;

drop policy if exists "public read couple_info" on couple_info;
create policy "public read couple_info" on couple_info for select using (true);
drop policy if exists "auth write couple_info" on couple_info;
create policy "auth write couple_info" on couple_info for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "public read pages" on pages;
create policy "public read pages" on pages for select using (true);
drop policy if exists "auth write pages" on pages;
create policy "auth write pages" on pages for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "public read elements" on elements;
create policy "public read elements" on elements for select using (true);
drop policy if exists "auth write elements" on elements;
create policy "auth write elements" on elements for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------------------------------------------------------
-- STORAGE: bucket público pra fotos/áudios/vídeos
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('diary-media', 'diary-media', true)
  on conflict (id) do nothing;

drop policy if exists "public read media" on storage.objects;
create policy "public read media" on storage.objects for select
  using (bucket_id = 'diary-media');

drop policy if exists "auth upload media" on storage.objects;
create policy "auth upload media" on storage.objects for insert
  with check (bucket_id = 'diary-media' and auth.role() = 'authenticated');

drop policy if exists "auth update media" on storage.objects;
create policy "auth update media" on storage.objects for update
  using (bucket_id = 'diary-media' and auth.role() = 'authenticated');

drop policy if exists "auth delete media" on storage.objects;
create policy "auth delete media" on storage.objects for delete
  using (bucket_id = 'diary-media' and auth.role() = 'authenticated');

-- ---------------------------------------------------------
-- DADOS INICIAIS (rode só uma vez — a primeira página)
-- ---------------------------------------------------------
insert into couple_info (start_date, name_a, name_b)
  select '2023-02-14', 'Você', 'Seu Amor'
  where not exists (select 1 from couple_info);

do $$
declare
  v_page_id uuid;
begin
  if not exists (select 1 from pages where spread_index = 0 and side = 'right') then
    insert into pages (spread_index, side) values (0, 'right') returning id into v_page_id;

    insert into elements (page_id, type, content, x, y, width, height, font_size)
    values
      (v_page_id, 'text', 'Para nós dois,', 8, 8, 84, 14, 34),
      (v_page_id, 'text', 'Cada página daqui é um pedacinho do nosso tempo juntos. Fotos, áudios, bilhetes bobos e coisas sérias — tudo cabe aqui. Vira a página e continua a nossa história.', 8, 26, 84, 50, 22);
  end if;
end $$;
