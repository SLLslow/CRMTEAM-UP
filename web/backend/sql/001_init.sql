create table if not exists agreements (
  id bigint primary key,
  title text,
  ordered_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  total numeric(14,2) not null default 0,
  result text,
  manager_id int,
  manager_name text,
  stage_name text,
  source_name text,
  client_id bigint,
  client_name text,
  raw_json jsonb,
  synced_at timestamptz not null default now()
);

create index if not exists idx_agreements_ordered_at on agreements (ordered_at);
create index if not exists idx_agreements_updated_at on agreements (updated_at);
create index if not exists idx_agreements_manager_id on agreements (manager_id);
create index if not exists idx_agreements_stage_name on agreements (stage_name);

create table if not exists sync_state (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

create table if not exists sync_logs (
  id bigserial primary key,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  duration_ms int not null,
  status text not null,
  date_from date,
  date_to date,
  manager_ids text,
  loaded_count int not null default 0,
  source_loaded_count int not null default 0,
  error_message text
);

create index if not exists idx_sync_logs_started_at on sync_logs (started_at desc);

create table if not exists app_users (
  id bigserial primary key,
  email text not null unique,
  password_hash text not null,
  full_name text,
  is_admin boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_app_users_email on app_users (email);

alter table app_users
  add column if not exists is_admin boolean not null default false;
