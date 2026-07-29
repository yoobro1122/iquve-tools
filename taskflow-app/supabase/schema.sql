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
  ai_credit_alert_opt_in boolean not null default false, -- AI 크레딧 소진 알림을 받을 담당자
  created_at timestamptz not null default now()
);

-- 2) major_categories: 대분류
create table if not exists major_categories (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- 3) categories: 업무 카테고리 (sort_order로 진행 순서를 정합니다 - 같은 에피소드 안에서 앞 순서가 끝나야 다음이 시작됨)
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- 4) projects
-- volume_check: 'Not yet' | 'Complete'   upload_status(업로드 확인): 'Not yet' | 'Complete'
-- review_status(검수 상태): 'Not yet' | 'Revision' | 'Complete'
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  major_category_id uuid not null references major_categories(id),
  volume_check text not null default 'Not yet',
  upload_status text not null default 'Not yet',
  upload_decision text,
  decline_reason text default '',
  review_status text not null default 'Not yet',
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
-- contractor_id: 현재(최신) 구간을 담당하는 외주 작업자. manager_id: 메인 담당자.
-- 실제 시작/종료 시각, 파일 링크, 평점은 인계 시마다 나뉘는 task_assignments(구간)에서 관리합니다.
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  project_id uuid not null references projects(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  episode_id uuid references episodes(id),
  contractor_id uuid not null references profiles(id),
  manager_id uuid references profiles(id),
  status text not null default 'waiting',
  planned_start_date timestamptz not null default now(), -- 등록 시 지정한 발송 예정 일시 (알림 메일 기준)
  start_notice_sent boolean not null default false,
  memo text default '',
  rework_acknowledged boolean not null default false,
  reopen_count int not null default 0, -- 완료 후 재작업(재오픈)된 횟수 - 0보다 크면 카드에 "(재진행)" 표시
  order_unlock_notified boolean not null default false, -- 카테고리 순서상 "시작 가능" 알림을 이미 보냈는지
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 6-1) task_assignments: 업무 배정 구간 (인계 또는 완료 후 재작업 시마다 새 구간 생성)
-- 각 구간별로 시작/종료 시각, 제출 파일 링크, 평점, 사용한 AI 서비스/소진 크레딧을 따로 기록합니다.
create table if not exists task_assignments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  contractor_id uuid not null references profiles(id),
  started_at timestamptz,
  ended_at timestamptz,
  file_link text default '',
  rating int check (rating between 1 and 5),
  handoff_reason text default '', -- 인계 또는 완료 후 재작업 요청 사유
  is_rework boolean not null default false, -- 완료된 업무를 재오픈해서 생긴 구간이면 true (카드에 재시작/재종료로 표시)
  ai_account_id uuid, -- FK는 아래 contractor_ai_accounts 생성 후 추가
  credit_used numeric,
  created_at timestamptz not null default now()
);

-- 6-1-1) ai_services: AI 서비스 카탈로그 (예: Midjourney, Runway 등)
create table if not exists ai_services (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  created_at timestamptz not null default now()
);

-- 6-1-2) contractor_ai_accounts: 외주 작업자별 AI 서비스 계정 + 잔여 크레딧
create table if not exists contractor_ai_accounts (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references profiles(id) on delete cascade,
  ai_service_id uuid not null references ai_services(id) on delete cascade,
  account_label text default '',
  remaining_credit numeric not null default 0,
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'task_assignments_ai_account_fkey') then
    alter table task_assignments add constraint task_assignments_ai_account_fkey
      foreign key (ai_account_id) references contractor_ai_accounts(id) on delete set null;
  end if;
end $$;

-- 6-2) task_sub_managers: 서브 담당자 (이메일 참조 개념) - 확인 여부 + 의견만 남기고 검수 권한은 없음
create table if not exists task_sub_managers (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  manager_id uuid not null references profiles(id),
  acknowledged boolean not null default false,
  comment text default '',
  created_at timestamptz not null default now(),
  unique (task_id, manager_id)
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
alter table task_assignments enable row level security;
alter table task_sub_managers enable row level security;
alter table task_rework_notes enable row level security;
alter table project_logs enable row level security;
alter table ai_services enable row level security;
alter table contractor_ai_accounts enable row level security;

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
  or exists (select 1 from task_assignments ta where ta.task_id = tasks.id and ta.contractor_id = auth.uid())
  or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'manager')
);

drop policy if exists "task_assignments_select" on task_assignments;
create policy "task_assignments_select" on task_assignments for select using (
  contractor_id = auth.uid()
  or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'manager')
);

drop policy if exists "task_sub_managers_select" on task_sub_managers;
create policy "task_sub_managers_select" on task_sub_managers for select using (
  manager_id = auth.uid()
  or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'manager')
);

drop policy if exists "ai_services_select" on ai_services;
create policy "ai_services_select" on ai_services for select using (auth.role() = 'authenticated');

drop policy if exists "contractor_ai_accounts_select" on contractor_ai_accounts;
create policy "contractor_ai_accounts_select" on contractor_ai_accounts for select using (
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

-- v1.02 마이그레이션: 업무 시작/완료 시각(시:분) 기록 + 업무별 평점
-- alter table tasks alter column start_date type timestamptz using start_date::timestamptz;
-- alter table tasks alter column completed_date type timestamptz using completed_date::timestamptz;
-- alter table tasks add column if not exists rating int check (rating between 1 and 5);

-- v1.03 마이그레이션: 등록일에 시:분까지 지정 가능하도록 변경
-- alter table tasks alter column planned_start_date type timestamptz using planned_start_date::timestamptz;

-- v1.03 마이그레이션: 사용 중인 카테고리도 삭제할 수 있도록 (삭제 시 해당 업무는 "미지정"으로 표시)
-- alter table tasks alter column category_id drop not null;
-- alter table tasks drop constraint if exists tasks_category_id_fkey;
-- alter table tasks add constraint tasks_category_id_fkey foreign key (category_id) references categories(id) on delete set null;

-- v1.04 마이그레이션: 업무 인계(핸드오프) 지원 - 구간별 배정 기록 + 서브 담당자(참조)
-- 기존 tasks.start_date/completed_date/file_link/rating 데이터를 새 task_assignments로 옮긴 뒤 컬럼을 제거합니다.
-- insert into task_assignments (task_id, contractor_id, started_at, ended_at, file_link, rating, created_at)
--   select id, contractor_id, start_date, completed_date, file_link, rating, created_at from tasks;
-- alter table tasks drop column if exists start_date;
-- alter table tasks drop column if exists completed_date;
-- alter table tasks drop column if exists file_link;
-- alter table tasks drop column if exists rating;
--
-- create table if not exists task_assignments (
--   id uuid primary key default gen_random_uuid(),
--   task_id uuid not null references tasks(id) on delete cascade,
--   contractor_id uuid not null references profiles(id),
--   started_at timestamptz,
--   ended_at timestamptz,
--   file_link text default '',
--   rating int check (rating between 1 and 5),
--   handoff_reason text default '',
--   created_at timestamptz not null default now()
-- );
-- create table if not exists task_sub_managers (
--   id uuid primary key default gen_random_uuid(),
--   task_id uuid not null references tasks(id) on delete cascade,
--   manager_id uuid not null references profiles(id),
--   acknowledged boolean not null default false,
--   comment text default '',
--   created_at timestamptz not null default now(),
--   unique (task_id, manager_id)
-- );
-- alter table task_assignments enable row level security;
-- alter table task_sub_managers enable row level security;
-- create policy "task_assignments_select" on task_assignments for select using (
--   contractor_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'manager')
-- );
-- create policy "task_sub_managers_select" on task_sub_managers for select using (
--   manager_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'manager')
-- );

-- v1.05 마이그레이션
-- 1) 상태값 단순화 (기존 데이터 값 변환)
-- update projects set volume_check = 'Complete' where volume_check = 'Done';
-- update projects set volume_check = 'Not yet' where volume_check = 'Checking';
-- update projects set review_status = 'Not yet' where review_status = 'Processing';
-- update projects set review_status = 'Revision' where review_status in ('Revision(Kor)', 'R-Complete');
-- update projects set review_status = 'Complete' where review_status = 'Complete(Kor)';

-- 2) 카테고리 순서 + 업무 재오픈/순서알림 + AI 크레딧 알림 옵트인
-- alter table categories add column if not exists sort_order int not null default 0;
-- alter table profiles add column if not exists ai_credit_alert_opt_in boolean not null default false;
-- alter table tasks add column if not exists reopen_count int not null default 0;
-- alter table tasks add column if not exists order_unlock_notified boolean not null default false;
-- alter table task_assignments add column if not exists is_rework boolean not null default false;

-- 3) 이전 버전에서 tasks_select 정책이 "현재 담당자만" 이었다면 아래로 교체 (참여했던 업무 조회 허용)
-- drop policy if exists "tasks_select" on tasks;
-- create policy "tasks_select" on tasks for select using (
--   contractor_id = auth.uid()
--   or exists (select 1 from task_assignments ta where ta.task_id = tasks.id and ta.contractor_id = auth.uid())
--   or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'manager')
-- );

-- 4) AI 서비스 / 크레딧 테이블
-- create table if not exists ai_services (
--   id uuid primary key default gen_random_uuid(),
--   label text not null unique,
--   created_at timestamptz not null default now()
-- );
-- create table if not exists contractor_ai_accounts (
--   id uuid primary key default gen_random_uuid(),
--   contractor_id uuid not null references profiles(id) on delete cascade,
--   ai_service_id uuid not null references ai_services(id) on delete cascade,
--   account_label text default '',
--   remaining_credit numeric not null default 0,
--   updated_at timestamptz not null default now()
-- );
-- alter table task_assignments add column if not exists ai_account_id uuid references contractor_ai_accounts(id) on delete set null;
-- alter table task_assignments add column if not exists credit_used numeric;
-- alter table ai_services enable row level security;
-- alter table contractor_ai_accounts enable row level security;
-- create policy "ai_services_select" on ai_services for select using (auth.role() = 'authenticated');
-- create policy "contractor_ai_accounts_select" on contractor_ai_accounts for select using (
--   contractor_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'manager')
-- );
