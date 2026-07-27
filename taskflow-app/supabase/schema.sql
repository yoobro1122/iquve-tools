-- ============================================================
-- TaskFlow (미디어팀 외주 업무 관리) DB 스키마 - v1.01
-- Supabase SQL Editor에서 순서대로 실행하세요.
-- 이미 이전 버전 스키마를 실행하셨다면 파일 맨 아래 "마이그레이션" 섹션만 실행하시면 됩니다.
-- ============================================================

create extension if not exists "pgcrypto";

-- 1) profiles: auth.users 확장
create table if not exists profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  name text not null,
  role text not null check (role in ('manager', 'contractor')),
  specialty text default '',
  note text default '',
  must_change_password boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2) major_categories: 대분류
create table if not exists major_categories (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- 3) categories: 업무 카테고리
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  created_at timestamptz not null default now()
);

-- 4) projects
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  major_category_id uuid not null references major_categories(id),
  volume_check text not null default 'Not yet',
  upload_status text not null default 'Not yet',
  upload_decision text,
  decline_reason text default '',
  review_status text not null default 'Processing',
  remark text default '',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (major_category_id, code),
  unique (major_category_id, name)
);

-- 5) episodes: 프로젝트별로 등록/관리되는 에피소드 (1화, 2화, 표지 등)
create table if not exists episodes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now(),
  unique (project_id, label)
);

-- 6) tasks
-- status: 'waiting' | 'in_progress' | 'reviewing' | 'rework_notice' | 'done'
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  project_id uuid not null references projects(id) on delete cascade,
  category_id uuid not null references categories(id),
  episode_id uuid references episodes(id),
  contractor_id uuid not null references profiles(id),
  manager_id uuid references profiles(id),
  status text not null default 'waiting',
  planned_start_date date not null default current_date, -- 등록 시 지정한 업무 시작 예정일 (알림 메일 기준)
  start_notice_sent boolean not null default false,
  memo text default '',
  file_link text default '',
  start_date date,
  completed_date date,
  rework_acknowledged boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 7) task_rework_notes
create table if not exists task_rework_notes (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

-- 8) project_logs
create table if not exists project_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  actor_id uuid references profiles(id),
  actor_name text not null,
  change text not null,
  email_sent boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tasks_updated_at on tasks;
create trigger trg_tasks_updated_at
  before update on tasks
  for each row execute function set_updated_at();

-- ============================================================
-- 기본 데이터
-- ============================================================
insert into major_categories (label, sort_order) values
  ('영어시리즈 제작', 1),
  ('한글시리즈 제작', 2),
  ('한글싱글북', 3)
on conflict (label) do nothing;

insert into categories (label) values
  ('리디자인'), ('4K 업스케일'), ('신규 일러스트'), ('사운드 디자인'), ('표정팩')
on conflict (label) do nothing;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table profiles enable row level security;
alter table major_categories enable row level security;
alter table categories enable row level security;
alter table projects enable row level security;
alter table episodes enable row level security;
alter table tasks enable row level security;
alter table task_rework_notes enable row level security;
alter table project_logs enable row level security;

drop policy if exists "profiles_select_all" on profiles;
create policy "profiles_select_all" on profiles for select using (auth.role() = 'authenticated');

drop policy if exists "major_categories_select" on major_categories;
create policy "major_categories_select" on major_categories for select using (auth.role() = 'authenticated');

drop policy if exists "categories_select" on categories;
create policy "categories_select" on categories for select using (auth.role() = 'authenticated');

drop policy if exists "projects_select" on projects;
create policy "projects_select" on projects for select using (auth.role() = 'authenticated');

drop policy if exists "episodes_select" on episodes;
create policy "episodes_select" on episodes for select using (auth.role() = 'authenticated');

drop policy if exists "tasks_select" on tasks;
create policy "tasks_select" on tasks for select using (
  contractor_id = auth.uid()
  or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'manager')
);

drop policy if exists "task_rework_notes_select" on task_rework_notes;
create policy "task_rework_notes_select" on task_rework_notes for select using (
  exists (
    select 1 from tasks t where t.id = task_rework_notes.task_id
      and (t.contractor_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'manager'))
  )
);

drop policy if exists "project_logs_select_manager" on project_logs;
create policy "project_logs_select_manager" on project_logs for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'manager')
);

-- ============================================================
-- 마이그레이션: 이미 이전 버전(v1.0) 스키마를 실행하셨다면 아래만 실행하세요.
-- ============================================================
-- alter table tasks alter column subheading_id drop not null;
-- alter table profiles add column if not exists must_change_password boolean not null default false;
-- alter table subheadings rename to episodes;
-- alter table tasks rename column subheading_id to episode_id;
-- alter table tasks add column if not exists manager_id uuid references profiles(id);
-- alter table tasks add column if not exists planned_start_date date not null default current_date;
-- alter table tasks add column if not exists start_notice_sent boolean not null default false;
-- alter table tasks add column if not exists memo text default '';
-- alter table tasks add column if not exists file_link text default '';
