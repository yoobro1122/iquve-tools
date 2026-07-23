# Aqua Mechanica — 배포 가이드 (GitHub → Vercel → Supabase)

이 폴더는 게임(`public/index.html`)과, 클라우드 저장/불러오기를 위한 Vercel 서버리스
함수 2개(`/api/save`, `/api/load`), 그리고 Supabase 스키마로 구성되어 있습니다.

로그인하지 않아도 게임은 그대로 잘 동작합니다(브라우저 `localStorage`에 자동 저장).
이메일로 로그인하면 그 위에 클라우드 백업이 추가로 붙는 구조입니다.

---

## 0. 준비물

- GitHub 계정
- Vercel 계정 (GitHub으로 바로 가입 가능)
- Supabase 계정 (무료 플랜으로 충분)
- Node.js가 로컬에 설치되어 있으면 좋지만 필수는 아닙니다 (Vercel이 빌드/배포를 대신 해줍니다)

---

## 1. Supabase 프로젝트 만들기

1. https://supabase.com → **New project** 생성 (이름/DB 비밀번호는 원하는 대로).
2. 프로젝트가 생성되면 왼쪽 메뉴 **SQL Editor** → **New query**로 이동.
3. 이 폴더의 `sql/schema.sql` 내용을 복사해서 붙여넣고 **Run** 실행.
   - `saves` 테이블과, 사용자가 자기 데이터만 보게 하는 RLS 정책이 생성됩니다.
4. 왼쪽 메뉴 **Project Settings → API**로 이동해서 아래 3가지 값을 복사해 둡니다.
   - `Project URL` (예: `https://xxxxxxxx.supabase.co`)
   - `anon public` key
   - `service_role` key (⚠️ 절대 클라이언트/깃허브에 노출하면 안 되는 비밀 키)
5. **Authentication → Providers**에서 Email 로그인이 기본 활성화되어 있는지 확인.
   (매직 링크 로그인 방식이라 비밀번호 설정은 필요 없습니다.)
6. **Authentication → URL Configuration**에서 `Site URL`을 나중에 Vercel 배포 URL로
   업데이트해줘야 매직 링크가 올바른 주소로 돌아옵니다 (3단계 배포 후 다시 와서 설정).

---

## 2. 클라이언트에 Supabase 값 채워넣기

`public/index.html`에서 아래 두 줄을 찾아 Supabase 값으로 교체하세요.
(anon key는 공개되어도 안전한 값입니다 — RLS가 실제 데이터 접근을 막아줍니다.)

```js
const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";
```

---

## 3. GitHub에 올리기

이 폴더(`aqua-mechanica-deploy` 등 원하는 이름) 전체를 새 GitHub 저장소로 올립니다.

```bash
cd 이-폴더-경로
git init
git add .
git commit -m "Initial commit: Aqua Mechanica"
git branch -M main
git remote add origin https://github.com/<본인계정>/aqua-mechanica.git
git push -u origin main
```

`.gitignore`에 `.env`가 포함되어 있으니 실수로 비밀 키를 커밋할 걱정은 없습니다.

---

## 4. Vercel에 배포하기

1. https://vercel.com → **Add New... → Project** → 방금 만든 GitHub 저장소 선택 → **Import**.
2. Framework Preset은 자동 감지가 안 되면 **Other**로 두면 됩니다
   (정적 `public/` 폴더 + `api/` 서버리스 함수 구조라 별도 빌드 명령이 필요 없습니다).
3. **Environment Variables**에 아래 2개를 추가:
   | Key | Value |
   |---|---|
   | `SUPABASE_URL` | 1단계에서 복사한 Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | 1단계에서 복사한 service_role 키 |
4. **Deploy** 클릭. 몇 분 내로 `https://your-project.vercel.app` 주소가 발급됩니다.
5. 배포된 주소를 Supabase **Authentication → URL Configuration → Site URL**에 다시
   등록해줍니다 (매직 링크 리다이렉트가 정확히 동작하려면 필요).

---

## 5. 동작 확인

- 배포된 URL을 열어 게임이 정상적으로 뜨는지 확인.
- 우측 사이드바의 이메일 입력창에 본인 이메일을 넣고 **로그인 링크 받기** 클릭.
- 메일함에서 링크를 클릭하면 같은 사이트로 돌아오면서 로그인 상태가 됩니다.
- 이후 마을 단계에 도달할 때마다 `localStorage` + Supabase에 동시 저장됩니다.
- 다른 기기/브라우저에서 같은 이메일로 로그인 후 **이어서 하기**를 누르면 클라우드
  저장분을 불러옵니다.

---

## 로컬에서 테스트하고 싶다면

Vercel CLI로 API 함수까지 포함해 로컬 실행할 수 있습니다.

```bash
npm i -g vercel
cp .env.example .env   # 값 채워넣기
vercel dev
```

---

## 구조 요약

```
├── api/
│   ├── save.js        # POST: 로그인한 사용자의 세이브 데이터 upsert
│   └── load.js         # GET:  로그인한 사용자의 세이브 데이터 조회
├── lib/
│   └── supabaseAdmin.js  # 서버 전용 service_role 클라이언트
├── public/
│   └── index.html      # 게임 본체 (클라이언트에는 anon key만 존재)
├── sql/
│   └── schema.sql      # saves 테이블 + RLS 정책
├── package.json
├── .env.example
└── .gitignore
```

## 나중에 더 하면 좋은 것들 (지금은 안 함)

- 자동 저장 실패 시 재시도 큐 (현재는 실패해도 그냥 다음 저장 때 다시 시도)
- 세이브 여러 슬롯 지원 (지금은 계정당 1개 세이브만 유지 — `saves.user_id`가 PK)
- 소셜 로그인(Google 등) — Supabase에서 Provider만 켜면 되지만 별도 설정 필요
