create extension if not exists pgcrypto;

create table if not exists settings (
  id integer primary key default 1,
  slack_channel text not null default '#incident-general',
  slack_secret_channel text not null default '#incident-secret',
  created_at timestamptz not null default now()
);

insert into settings (id, slack_channel, slack_secret_channel)
values (1, '#incident-general', '#incident-secret')
on conflict (id) do nothing;

create table if not exists accounts (
  id text primary key,
  name text not null,
  email text not null unique,
  role text not null default 'user',
  created_at timestamptz not null default now()
);

create table if not exists incidents (
  id text primary key,
  title text not null,
  description text not null,
  type text not null,
  priority text not null,
  status text not null,
  is_confidential boolean not null default false,
  reporter_id text,
  assignee_id text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  cause text,
  prevention text,
  allowed_user_ids jsonb not null default '[]'::jsonb,
  custom_fields jsonb not null default '{}'::jsonb,
  comments jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  message text not null,
  channel text not null,
  created_at timestamptz not null default now()
);

insert into accounts (id, name, email, role)
values
  ('u1', '田中', 'tanaka@example.com', 'admin'),
  ('u2', '佐藤', 'sato@example.com', 'user')
on conflict (id) do nothing;
