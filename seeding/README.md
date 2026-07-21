# 인플루언서 발굴 & 관리 도구 (seeding)

`yoobro1122/iquve-tools` 레포 안에 `seeding/`라는 새 폴더로 통째로 추가하는 **독립 Next.js
프로젝트**입니다. 레포 안의 다른 도구(`newsletter.html`, `crm.html` 등)는 정적 HTML이지만,
이 도구는 API 라우트 + Supabase 연동이 필요해서 "메일 발송" 도구처럼 **별도 Vercel
프로젝트로 배포**하는 구조예요.

## 1. GitHub에 폴더 추가

레포 루트에 `seeding/` 폴더를 만들고 이 안의 파일 전체(폴더 구조 그대로)를 넣으세요.

```
seeding/
  package.json
  next.config.js
  tsconfig.json
  tailwind.config.ts
  postcss.config.js
  .gitignore
  .env.example
  schema.sql
  README.md
  app/
    layout.tsx
    page.tsx              # 접속 시 /influencers로 리다이렉트
    globals.css
    influencers/page.tsx
    api/
      settings/route.ts
      youtube/search/route.ts
      instagram/hashtag-media/route.ts
      instagram/discover/route.ts
      naver/search/route.ts
      influencers/route.ts
      influencers/[id]/route.ts
      influencers/export/route.ts
  lib/
    youtube.ts
    instagram.ts
    naver.ts
    apiConfig.ts
    supabase.ts
```

로컬에서 커밋 예시:

```bash
git checkout -b feature/influencer-seeding
# seeding/ 폴더를 통째로 복사해 넣은 뒤
git add seeding
git commit -m "인플루언서 발굴 도구(seeding) 추가"
git push origin feature/influencer-seeding
```

## 2. Vercel에 새 프로젝트로 배포 (기존 프로젝트에 합치지 않음)

1. Vercel 대시보드 → "Add New... → Project" → `yoobro1122/iquve-tools` 레포 선택
2. **Root Directory**를 `seeding`으로 지정 (이게 핵심 — 레포는 하나지만 이 폴더만 빌드)
3. Framework Preset은 Next.js 자동 감지됨
4. 아래 환경변수만 등록 후 배포

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...     # anon key 아님, service role key 사용 (서버에서만 씀)
```

5. 배포 완료 후 나오는 도메인(예: `https://iquve-seeding.vercel.app`)을 `index.html`의
   카드 링크에 넣으면 됩니다 (아래 "index.html 반영" 참고)

나머지 API 키(유튜브, 인스타그램, 네이버)는 배포 후 앱 접속해서 **설정 탭**에 입력하면
Supabase `api_config` 테이블에 저장되고 자동으로 사용됩니다.

## 3. Supabase 테이블 생성

Supabase 프로젝트(`emgsqnzfdvvbtooouaap`)의 SQL Editor에서 `schema.sql` 실행. 마지막 줄에
확인용 더미 데이터 1건이 함께 들어가니, 실행 후 바로 DB 관리 탭(기본 화면)에서 확인해보세요.
필요 없어지면 표에서 삭제 버튼으로 지우면 됩니다.

## 4. 유튜브 API 키 발급

1. https://console.cloud.google.com 접속 → 새 프로젝트 생성
2. "API 및 서비스 → 라이브러리"에서 **YouTube Data API v3** 사용 설정
3. "사용자 인증 정보 → API 키 만들기"로 키 발급
4. 보안을 위해 "API 제한사항"에서 YouTube Data API v3만 허용하도록 제한 설정
5. 일일 무료 쿼터 10,000 units (채널 검색 1회 ≈ 100 units + 채널 상세 조회 1 unit)
6. 발급받은 키는 앱 접속 후 **설정 탭 → "유튜브 Data API 키"**에 붙여넣고 저장

## 5. 인스타그램 토큰 확인

이미 비즈니스/크리에이터 계정 전환 및 페이스북 페이지 연결이 되어있다고 하셨으니, Meta for
Developers에서 앱을 만들고 아래를 확인하면 됩니다.

1. https://developers.facebook.com 에서 앱 생성 (유형: 비즈니스)
2. 제품 추가 → Instagram Graph API 연결
3. Graph API Explorer에서 `instagram_basic`, `instagram_manage_insights`,
   `pages_show_list`, `pages_read_engagement` 권한으로 User Access Token 발급
4. 해당 토큰을 장기 토큰(Long-Lived Token, 60일)으로 교환
5. `/me/accounts`로 연결된 페이스북 페이지 ID 확인 → 그 페이지에 연결된
   `instagram_business_account.id` 확인
6. 발급받은 Access Token과 Business Account ID를 앱 접속 후 **설정 탭**의 해당 항목에
   각각 붙여넣고 저장

## 6. 네이버 검색 오픈API 키 발급

1. https://developers.naver.com/apps/#/register 접속 (네이버 개발자센터, 로그인 필요)
2. "애플리케이션 등록" → 이름 입력 → 사용 API에서 **검색** 체크
3. 비로그인 오픈 API 서비스 환경 → "WEB 설정"에 서비스 URL 등록 (배포 도메인, 예:
   `https://iquve-seeding.vercel.app`)
4. 등록 완료 후 발급되는 **Client ID / Client Secret** 복사
5. 하루 25,000회 무료 쿼터 (앱 기준)
6. 발급받은 Client ID / Client Secret을 앱 접속 후 **설정 탭**의 해당 항목에 각각 붙여넣고 저장

## index.html 반영

메인 `index.html`의 카드 하나를 아래처럼 바꾸면 됩니다 (아래 답변 본문에 전체 파일 첨부):

```html
<a href="https://iquve-seeding.vercel.app" target="_blank" class="card new">
  <div class="card-icon">🔎</div>
  <div class="card-title">인플루언서 크롤러 <span class="badge-new">NEW</span></div>
  <div class="card-desc">유튜브·인스타그램·네이버 블로그 인플루언서를 찾고 DB로 관리해요</div>
  <div class="card-arrow">바로가기 →</div>
</a>
```

실제 Vercel 배포 도메인이 정해지면 `href`만 그 값으로 바꿔주세요.

## 설정 탭 사용법

배포 후 앱에 처음 접속하면 **설정** 탭이 기본으로 열립니다. 각 항목에 값을 입력하고 "저장"을
누르면 Supabase `api_config` 테이블에 저장됩니다. 저장된 값은 보안을 위해 화면에 다시
표시되지 않고, "저장됨 · 날짜"로만 확인할 수 있습니다. 값을 바꾸고 싶으면 새 값을 입력하고
다시 저장하면 됩니다 (덮어쓰기).

## 사용 플로우

- **유튜브 검색 탭**: 키워드 + 최소 구독자수 입력 → 검색 → "DB에 등록"
- **인스타 발견 탭**:
  1. 해시태그 입력 → 게시물 목록(좋아요/날짜/permalink) 조회
  2. permalink를 열어서 계정 username 확인 (수작업)
  3. 확인한 username들을 한 줄에 하나씩 입력 → 최소 팔로워수 / 최근 활동 기준일(기본 7일)
     입력 → "일괄 조회" → 조건에 맞는 계정만 자동 필터링되어 표시
  4. "DB에 등록"으로 저장
- **네이버 블로그 탭**: 키워드 검색 → 최근 N일 이내 포스팅 필터 → (선택) 이웃수 직접 입력 →
  "DB에 등록"
- **DB 관리 탭**: 플랫폼/상태로 필터링, 진행상태(연락전/협의중/완료/보류) 드롭다운으로 변경,
  컨택포인트·메모는 표에서 직접 입력 후 다른 곳 클릭하면 자동 저장, 삭제
  - "엑셀 다운로드" 버튼을 누르면 현재 필터 조건이 적용된 목록이 .xlsx로 즉시 다운로드됩니다
    (플랫폼/계정/팔로워수/카테고리/컨택포인트/진행상태/메모/등록일 포함)

## 알아둘 점

- 인스타그램 해시태그 검색은 계정당 **7일 이내 최대 30개 고유 해시태그**만 조회 가능합니다.
  같은 해시태그를 반복 조회하는 건 이 제한에 걸리지 않으니, 자주 쓰는 해시태그 위주로 운영하세요.
- Business Discovery는 순차 호출 + 300ms 딜레이를 넣어뒀습니다. 한 번에 너무 많은 username을
  넣으면 느려질 수 있으니 20~30개 단위로 나눠 조회하는 걸 추천합니다.
- `contact_dm` 필드에 이메일·DM·오픈채팅 등 컨택포인트를 자유 형식으로 기재하시면 됩니다.
  (이메일 전용 필드는 중복이라 제거했습니다.)
- 네이버 블로그는 이웃수·방문자수를 알려주는 공식 API가 없습니다. 검색 결과의 bloggerlink를
  열어 프로필에서 직접 확인 후, 등록 화면의 "이웃수" 칸에 입력하는 방식으로 운영해주세요
  (자동화된 크롤링은 이용약관 위반 소지가 있어 넣지 않았습니다).
