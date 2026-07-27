# TaskFlow — 미디어팀 외주 업무 관리 시스템 (v1.01)

Next.js + Supabase + Resend로 만든 실제 서비스용 앱입니다.

## v1.01 주요 변경사항

1. **작업 파일 링크**: 업무 종료/수정완료 시 작업 파일 링크 입력이 필수이며, 담당자가 카드에서 바로 확인할 수 있습니다.
2. **에피소드**: subheading을 대체하는 "에피소드" 기능. 프로젝트 헤더 아래에 에피소드 탭이 있고, 클릭하면 해당 에피소드 업무만 표시됩니다. "수정" 버튼으로 추가/이름수정/삭제.
3. **업무 시작일 예약 + 메모**: 업무 등록 시 시작일(기본값 오늘)과 메모를 입력할 수 있습니다. 시작일을 미래로 바꾸면 그 날짜 00시(KST)에 등록 알림 메일이 자동 발송되고, 메모도 함께 전달됩니다.
4. **프로젝트 현황 확장 + 엑셀 다운로드**: 프로젝트명을 누르면 에피소드별 업무/작업자/담당자/시작일/종료일/작업일수가 펼쳐지고, "엑셀 다운로드"로 프로젝트를 선택해 xlsx 파일로 받을 수 있습니다.
5. **삭제 처리 개선**: 비활성화(삭제)된 업무는 프로젝트의 "모든 업무 완료" 판정에서 제외됩니다. 삭제된 프로젝트/업무 목록에 "완전 삭제" 버튼이 추가되어 DB에서 영구 삭제할 수 있습니다 (되돌릴 수 없음).
6. **작업자 재배정 알림**: 업무 수정으로 외주 작업자를 변경하면 새로 배정된 작업자에게 메일이 발송됩니다.
7. **전체 보기에서도 프로젝트 등록 가능**: "전체 보기" 탭에서도 "새 프로젝트" 버튼이 보이며, 등록 시 대분류를 직접 선택합니다.
8. **담당자 표시**: 업무 카드에 외주 작업자 이름 옆으로 담당자 이름이 함께 표시됩니다. (업무마다 담당자를 지정할 수 있습니다)
9. **전체 업무 검색**: "전체 업무" 화면에서 작업자/담당자 이름으로 검색해 담당 업무를 바로 확인할 수 있습니다.

## 기능 요약

- **로그인**: Supabase Auth. 최초 담당자만 SQL로 생성, 이후 담당자·외주 작업자는 앱 안에서 서로 등록 (임시 비밀번호 발급 → 첫 로그인 시 본인 비밀번호로 변경 강제).
- **대분류**: 탭에서 추가·수정·삭제, "전체 보기"로 한 번에 열람.
- **프로젝트**: 등록/수정/삭제(비활성화)·복원·완전삭제, D-day, 4가지 상태 + 변경 로그, 에피소드 관리.
- **업무**: 등록(에피소드·카테고리·외주작업자·담당자·시작일·메모)/수정/삭제·복원·완전삭제.
- **업무 진행 흐름**: 시작 → 종료(파일 링크 필수) → 담당자 검수확인/재작업요청 → (재작업 시) 메시지 확인완료 → 수정완료(파일 링크) → 다시 검수.
- **게시 처리**: 모든 업무 완료(비활성화 업무 제외) + 검수상태 Complete(Kor)일 때만 게시 확인/불가 노출.
- **프로젝트 현황**: 확장 가능한 테이블 + 엑셀 다운로드, 외주 작업자 관리, 담당자 관리.
- **이메일 알림** (Resend): 업무 등록(즉시 또는 예약일 00시)/시작/종료/검수통과/재작업요청/작업자 재배정/게시확인·보류.

## 1. Supabase 설정

1. [supabase.com](https://supabase.com)에서 프로젝트 생성 (신규 설치라면)
2. SQL Editor에서 `supabase/schema.sql` 전체 실행
3. **이미 이전 버전을 운영 중이셨다면** `schema.sql` 맨 아래 "마이그레이션" 섹션의 주석 처리된 SQL을 실행하세요:

```sql
alter table tasks alter column subheading_id drop not null;
alter table profiles add column if not exists must_change_password boolean not null default false;
alter table subheadings rename to episodes;
alter table tasks rename column subheading_id to episode_id;
alter table tasks add column if not exists manager_id uuid references profiles(id);
alter table tasks add column if not exists planned_start_date date not null default current_date;
alter table tasks add column if not exists start_notice_sent boolean not null default false;
alter table tasks add column if not exists memo text default '';
alter table tasks add column if not exists file_link text default '';
```

4. **첫 담당자 계정**만 아래처럼 SQL로 직접 만들어주세요 (이후 담당자는 앱 안의 "담당자 관리" 화면에서 서로 추가할 수 있습니다).

```sql
insert into profiles (id, email, name, role)
select id, email, '담당자 이름', 'manager'
from auth.users
where email = 'manager@example.com';
```

   위 계정으로 로그인하기 전에 Supabase Authentication 탭에서 해당 이메일로 사용자를 먼저 만들어두세요 (비밀번호를 직접 지정하고 "Auto Confirm User" 체크).

## 2. Resend 설정

1. [resend.com](https://resend.com) 가입, 발신 도메인 인증
2. API 키 발급 → `RESEND_API_KEY`
3. 인증된 발신 주소 → `EMAIL_FROM`

## 3. 환경 변수

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase Settings > API
- `SUPABASE_SERVICE_ROLE_KEY` — 같은 위치의 service_role 키 (서버 전용)
- `RESEND_API_KEY` / `EMAIL_FROM`
- `NEXT_PUBLIC_APP_URL` — 배포 후 실제 도메인
- `CRON_SECRET` — 예약 발송 크론 작업 보호용 임의의 긴 문자열을 직접 정해서 넣으세요

## 4. 예약 발송 크론 설정 (Vercel Cron)

`vercel.json`에 이미 크론 설정이 들어있습니다 (매일 UTC 15:00 = 한국시간 00:00에 `/api/cron/send-task-notices` 호출).
**배포 전에 `vercel.json` 파일을 열어서 `CRON_SECRET_PLACEHOLDER` 부분을 `.env.local`에 넣은 `CRON_SECRET` 값과 동일하게 바꿔주세요.**
Vercel 프로젝트가 Hobby 플랜이면 크론 실행 빈도 제한이 있을 수 있으니, Vercel 대시보드의 Cron Jobs 메뉴에서 활성화 여부를 확인해주세요.

## 5. 로컬 실행

```bash
npm install
npm run dev
```

## 6. GitHub + Vercel 배포

```bash
git init
git add .
git commit -m "TaskFlow v1.01"
git remote add origin https://github.com/<your-account>/<repo-name>.git
git push -u origin main
```

Vercel에서 저장소를 import하고, 위 환경 변수(CRON_SECRET 포함)를 Vercel 프로젝트 Settings > Environment Variables에 동일하게 등록하면 배포가 완료됩니다.

## 폴더 구조

```
app/
  login/page.tsx
  board/page.tsx           메인 화면
  contractors/page.tsx      외주 작업자 관리
  managers/page.tsx         담당자 관리
  api/
    major-categories/       대분류 CRUD
    categories/              업무 카테고리 CRUD
    projects/                등록/수정/삭제·복원·완전삭제/상태변경/게시처리/에피소드
    episodes/[id]/           에피소드 수정/삭제
    contractors/, managers/  계정 등록/수정/삭제/비밀번호초기화
    tasks/                   등록/수정/삭제·복원·완전삭제/시작/종료/검수/재작업/확인
    cron/send-task-notices/  예약된 업무 등록 알림 발송 (Vercel Cron)
lib/
  supabase/                Supabase 클라이언트
  resend.ts                이메일 발송 래퍼
  email-templates.ts       알림 메일 템플릿
  types.ts                 공용 타입 + 상태 계산 함수
supabase/schema.sql          테이블, RLS 정책, 기본 데이터, 마이그레이션 안내
vercel.json                  Cron 설정
```
