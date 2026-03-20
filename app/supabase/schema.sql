-- ── Shared updated_at trigger ─────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ── incidents ─────────────────────────────────────────────────────────────
create table incidents (
  id             text primary key,
  name           text not null,
  status         text not null default 'active',
  lat            float8 not null,
  lng            float8 not null,
  area           text,
  type           text,
  brush_radius_km float8,
  wind_deg       int,
  updated_at     timestamptz default now()
);
create trigger incidents_updated_at before update on incidents
  for each row execute function update_updated_at();

-- ── incident_communications ───────────────────────────────────────────────
create table incident_communications (
  id          text primary key,
  incident_id text references incidents(id) on delete cascade,
  name        text not null,
  role        text not null
);

-- ── fire_stations ─────────────────────────────────────────────────────────
create table fire_stations (
  id   text primary key,
  name text not null,
  type text not null,
  lat  float8 not null,
  lng  float8 not null
);

-- ── units ─────────────────────────────────────────────────────────────────
create table units (
  id         text primary key,
  name       text not null,
  type       text not null,
  air_kind   text,
  base_lat   float8,
  base_lng   float8,
  station_id text references fire_stations(id)
);

-- ── unit_states ───────────────────────────────────────────────────────────
create table unit_states (
  unit_id     text primary key references units(id) on delete cascade,
  incident_id text references incidents(id),
  status      text not null default 'available',
  lat         float8,
  lng         float8,
  updated_at  timestamptz default now()
);
create trigger unit_states_updated_at before update on unit_states
  for each row execute function update_updated_at();

-- ── zones ─────────────────────────────────────────────────────────────────
create table zones (
  id          uuid primary key default gen_random_uuid(),
  incident_id text references incidents(id) on delete cascade,
  name        text not null,
  type        text not null,
  radius_km   float8,
  points      jsonb,
  created_at  timestamptz default now()
);

-- ── closures ──────────────────────────────────────────────────────────────
create table closures (
  id          uuid primary key default gen_random_uuid(),
  incident_id text references incidents(id),
  name        text not null,
  status      text not null default 'active',
  points      jsonb not null,
  created_at  timestamptz default now()
);

-- ── alerts ────────────────────────────────────────────────────────────────
create table alerts (
  id          uuid primary key default gen_random_uuid(),
  incident_id text references incidents(id),
  title       text not null,
  level       text not null,
  message     text,
  radius      int,
  channels    jsonb default '[]',
  status      text not null default 'active',
  created_at  timestamptz default now()
);

-- ── op_log ────────────────────────────────────────────────────────────────
create table op_log (
  id          uuid primary key default gen_random_uuid(),
  type        text not null,
  payload     jsonb not null default '{}',
  incident_id text references incidents(id),
  unit_id     text references units(id),
  created_at  timestamptz default now()
);

-- ── Realtime ──────────────────────────────────────────────────────────────
alter table incidents          replica identity full;
alter table incident_communications replica identity full;
alter table fire_stations      replica identity full;
alter table units              replica identity full;
alter table unit_states        replica identity full;
alter table zones              replica identity full;
alter table closures           replica identity full;
alter table alerts             replica identity full;
alter table op_log             replica identity full;

alter publication supabase_realtime add table incidents;
alter publication supabase_realtime add table incident_communications;
alter publication supabase_realtime add table fire_stations;
alter publication supabase_realtime add table units;
alter publication supabase_realtime add table unit_states;
alter publication supabase_realtime add table zones;
alter publication supabase_realtime add table closures;
alter publication supabase_realtime add table alerts;
alter publication supabase_realtime add table op_log;

-- ── Row Level Security ────────────────────────────────────────────────────
alter table incidents              enable row level security;
alter table incident_communications enable row level security;
alter table fire_stations          enable row level security;
alter table units                  enable row level security;
alter table unit_states            enable row level security;
alter table zones                  enable row level security;
alter table closures               enable row level security;
alter table alerts                 enable row level security;
alter table op_log                 enable row level security;

-- Authenticated: full access to all tables
do $$
declare t text;
begin
  foreach t in array array[
    'incidents','incident_communications','fire_stations',
    'units','unit_states','zones','closures','alerts','op_log'
  ] loop
    execute format(
      'create policy "auth_all" on %I for all to authenticated using (true) with check (true)', t
    );
  end loop;
end $$;

-- Anon: read-only on public-facing tables (used by /publico page)
create policy "anon_read" on incidents for select to anon using (true);
create policy "anon_read" on alerts    for select to anon using (true);
create policy "anon_read" on closures  for select to anon using (true);
