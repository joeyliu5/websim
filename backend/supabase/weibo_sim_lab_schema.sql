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

create index if not exists idx_posts_topic_keyword on public.posts(topic_keyword);
create index if not exists idx_interaction_logs_post_id on public.interaction_logs(post_id);
create index if not exists idx_interaction_logs_event_type on public.interaction_logs(event_type);
create index if not exists idx_interaction_logs_timestamp on public.interaction_logs(timestamp desc);

alter table public.posts enable row level security;
alter table public.interaction_logs enable row level security;

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
