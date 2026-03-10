-- Weibo_Sim_Lab schema (Supabase / Postgres)
-- Run this in Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists public.posts (
  post_id text primary key,
  topic_keyword text not null,
  author_name text not null,
  author_avatar_url text,
  publish_time text,
  source text,
  content_text text not null,
  media_type text not null default 'image' check (media_type in ('text', 'image', 'video', 'mixed')),
  media_urls jsonb not null default '[]'::jsonb,
  video_url text,
  repost_count integer not null default 0,
  comment_count integer not null default 0,
  like_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.interaction_logs (
  id uuid primary key default gen_random_uuid(),
  post_id text not null,
  event_type text not null check (event_type in ('view', 'click', 'stay')),
  detail jsonb not null default '{}'::jsonb,
  timestamp timestamptz not null default now()
);

create table if not exists public.event_logs (
  id uuid primary key default gen_random_uuid(),
  participant_id text,
  session_id text,
  page_session_id text,
  page text not null,
  condition text,
  seq integer,
  event_name text not null,
  action text,
  target_id text,
  depth text,
  dwell_ms bigint,
  event_timestamp timestamptz not null default now(),
  received_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.action_logs (
  id uuid primary key default gen_random_uuid(),
  participant_id text,
  action_name text not null,
  target_id text,
  received_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.comment_logs (
  id text primary key,
  target_id text not null,
  content text not null,
  nickname text not null,
  participant_id text,
  created_at timestamptz not null default now(),
  likes integer not null default 0,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists idx_posts_topic_keyword on public.posts(topic_keyword);
create index if not exists idx_interaction_logs_post_id on public.interaction_logs(post_id);
create index if not exists idx_interaction_logs_event_type on public.interaction_logs(event_type);
create index if not exists idx_interaction_logs_timestamp on public.interaction_logs(timestamp desc);
create index if not exists idx_event_logs_participant_id on public.event_logs(participant_id);
create index if not exists idx_event_logs_page on public.event_logs(page);
create index if not exists idx_event_logs_event_name on public.event_logs(event_name);
create index if not exists idx_event_logs_event_timestamp on public.event_logs(event_timestamp desc);
create index if not exists idx_action_logs_participant_id on public.action_logs(participant_id);
create index if not exists idx_action_logs_action_name on public.action_logs(action_name);
create index if not exists idx_action_logs_received_at on public.action_logs(received_at desc);
create index if not exists idx_comment_logs_target_id on public.comment_logs(target_id);
create index if not exists idx_comment_logs_created_at on public.comment_logs(created_at desc);

alter table public.posts enable row level security;
alter table public.interaction_logs enable row level security;
alter table public.event_logs enable row level security;
alter table public.action_logs enable row level security;
alter table public.comment_logs enable row level security;

drop policy if exists "public read posts" on public.posts;
create policy "public read posts"
on public.posts
for select
to anon, authenticated
using (true);

drop policy if exists "public write interaction logs" on public.interaction_logs;
create policy "public write interaction logs"
on public.interaction_logs
for insert
to anon, authenticated
with check (true);
