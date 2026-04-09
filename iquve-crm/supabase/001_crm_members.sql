-- =============================================
-- iQuve CRM Members Table
-- Supabase SQL Editor에서 실행하세요
-- =============================================

create table if not exists public.crm_members (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique,
  parent_name    text,
  child_name     text,
  phone          text,
  social_type    text,
  member_status  text,

  -- 핵심 날짜 (CRM 그룹 분류 기준)
  join_date      date,         -- 가입일
  profile_date   date,         -- 프로필(자녀)등록일
  trial_start    date,         -- 체험시작일
  trial_end      date,         -- 체험종료일

  -- 상태 플래그
  has_child      boolean not null default false,
  has_trial      boolean not null default false,
  is_paid        boolean not null default false,

  -- 결제 정보 (결제 파일 업로드 시 채워짐)
  pay_count      int not null default 0,
  pay_total      int not null default 0,
  last_pay_date  date,

  -- 메타
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 인덱스
create index if not exists crm_members_join_date_idx    on public.crm_members(join_date);
create index if not exists crm_members_profile_date_idx on public.crm_members(profile_date);
create index if not exists crm_members_trial_start_idx  on public.crm_members(trial_start);
create index if not exists crm_members_is_paid_idx      on public.crm_members(is_paid);

-- updated_at 자동 업데이트 트리거
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists crm_members_updated_at on public.crm_members;
create trigger crm_members_updated_at
  before update on public.crm_members
  for each row execute function update_updated_at();

-- RLS 비활성화 (내부 관리 도구)
alter table public.crm_members disable row level security;
