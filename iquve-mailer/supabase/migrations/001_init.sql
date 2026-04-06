-- =============================================
-- iQuve Mailer - DB Schema
-- Run in Supabase SQL Editor
-- =============================================

-- 1. 회원 테이블
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  phone       text,
  category    text not null check (category in ('결제회원','이메일+전화번호','이메일만')),
  paid        boolean not null default false,
  marketing   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists members_category_idx on public.members(category);
create index if not exists members_email_idx    on public.members(email);

-- 2. 캠페인(발송 건) 테이블
create table if not exists public.campaigns (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  subject       text not null,
  html_content  text not null,
  groups        text[] not null,          -- ['결제회원','이메일+전화번호'] 등
  status        text not null default 'draft' check (status in ('draft','sending','done','error')),
  total_count   int not null default 0,
  sent_count    int not null default 0,
  fail_count    int not null default 0,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);

-- 3. 발송 로그 테이블
create table if not exists public.send_logs (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  email        text not null,
  status       text not null check (status in ('sent','failed')),
  error_msg    text,
  sent_at      timestamptz not null default now()
);

create index if not exists send_logs_campaign_idx on public.send_logs(campaign_id);

-- 4. RLS 비활성화 (내부 관리 도구 — 필요 시 나중에 활성화)
alter table public.members    disable row level security;
alter table public.campaigns  disable row level security;
alter table public.send_logs  disable row level security;
