-- Enable UUID helper if needed.
create extension if not exists pgcrypto;

create table if not exists public.ideas (
  idea_id uuid primary key default gen_random_uuid(),
  creator_id text not null,
  text text not null,
  state text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.idea_participants (
  idea_id uuid not null references public.ideas(idea_id) on delete cascade,
  user_id text not null,
  joined_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);

create table if not exists public.idea_messages (
  idea_id uuid not null references public.ideas(idea_id) on delete cascade,
  guild_id text not null,
  channel_id text not null,
  message_id text not null,
  created_at timestamptz not null default now(),
  primary key (idea_id, message_id)
);

create unique index if not exists ux_idea_messages_global_message
  on public.idea_messages (guild_id, channel_id, message_id);

create index if not exists ix_participants_idea
  on public.idea_participants (idea_id);

create index if not exists ix_messages_idea
  on public.idea_messages (idea_id);
