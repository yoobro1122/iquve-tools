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
Supabase `seeding_api_config` 테이블에 저장되고 자동으로 사용됩니다.

## 3. Supabase 테이블 생성

Supabase 프로젝트(`emgsqnzfdvvbtooouaap`)의 SQL Editor에서 `schema.sql` 실행. 마지막 줄에
확인용 더미 데이터 1건이 함께 들어가니, 실행 후 바로 DB 관리 탭(기본 화면)에서 확인해보세요.
필요 없어지면 표에서 삭제 버튼으로 지우면 됩니다.

> **이미 예전 버전의 `schema.sql`을 한 번 실행하셨다면** (설정 탭에서 `Could not find the
> 'key' column of 'api_config'` 같은 에러가 났다면), 예전에 Gemini 키 저장용으로 쓰시던
> `api_config` 테이블과 컬럼 구조가 달라서 충돌한 거예요. 아래 구문만 SQL Editor에서 추가로
> 실행하면 해결됩니다 (전체 `schema.sql`을 다시 실행할 필요 없음).
>
> ```sql
> create table if not exists seeding_api_config (
>   key text primary key,
>   value text not null,
>   updated_at timestamptz default now()
> );
> ```

## 4. 유튜브 API 키 발급

1. https://console.cloud.google.com 접속 → 새 프로젝트 생성
2. "API 및 서비스 → 라이브러리"에서 **YouTube Data API v3** 사용 설정
3. "사용자 인증 정보 → API 키 만들기"로 키 발급
4. 보안을 위해 "API 제한사항"에서 YouTube Data API v3만 허용하도록 제한 설정
5. 일일 무료 쿼터 10,000 units
   - 검색 1회당: search.list 100 units + channels.list 1 unit + **채널 개수만큼 100 units씩
     추가** (최근 업로드일을 채널마다 따로 조회하기 때문)
   - 예: "가져올 개수" 25로 검색하면 대략 100 + 1 + 25×100 = 약 2,600 units 소모
   - "가져올 개수"를 50으로 하면 한 번에 약 5,100 units 소모되니, 하루에 여러 번 검색하실
     거면 개수를 낮춰서(예: 10~15) 쓰시는 걸 추천해요
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
누르면 Supabase `seeding_api_config` 테이블에 저장됩니다. 저장된 값은 보안을 위해 화면에 다시
표시되지 않고, "저장됨 · 날짜"로만 확인할 수 있습니다. 값을 바꾸고 싶으면 새 값을 입력하고
다시 저장하면 됩니다 (덮어쓰기).

## 사용 플로우

- **유튜브 검색 탭**: 키워드 + 최소 구독자수 입력 → 검색 → "DB에 등록"
- **인스타 발견 탭** (⚠️ App Review 승인 전까지는 작동 안 할 수 있음 — 아래 참고):
  - username을 한 줄에 하나씩 입력 → 최소 팔로워수 / 최근 활동 기준일(기본 7일) 입력 →
    "일괄 조회" → 조건에 맞는 계정만 자동 필터링되어 표시 → "DB에 등록"
  - (해시태그로 게시물을 자동 발견하는 기능은 잠정적으로 뺐습니다. 아래 "알아둘 점" 참고)
- **네이버 블로그 탭**: 키워드 검색 → 최근 N일 이내 포스팅 필터 → (선택) 이웃수 직접 입력 →
  "DB에 등록"
- **DB 관리 탭**: 플랫폼/상태로 필터링, 진행상태(연락전/협의중/완료/보류) 드롭다운으로 변경,
  컨택포인트·메모는 표에서 직접 입력 후 다른 곳 클릭하면 자동 저장, 삭제
  - "엑셀 다운로드" 버튼을 누르면 현재 필터 조건이 적용된 목록이 .xlsx로 즉시 다운로드됩니다
    (플랫폼/계정/팔로워수/카테고리/컨택포인트/진행상태/메모/등록일 포함)

## 공통 자동화 기능

- **중복 제외**: 세 검색 탭 모두, 이미 DB에 등록된 채널/계정/블로그는 검색 결과에 아예 안 뜹니다.
- **이메일 자동 추출**: "DB에 등록" 누를 때 메모(유튜브 채널소개, 인스타 프로필소개, 네이버
  포스트설명)에 이메일 형식이 있으면 컨택포인트 칸에 자동으로 채워줍니다. 컨택포인트를 이미
  직접 입력한 경우엔 덮어쓰지 않아요.
- **네이버 블로그 이메일 유추**: 블로그 URL(`blog.naver.com/{네이버ID}/{게시물번호}`)의
  네이버ID로 `{아이디}@naver.com`을 자동으로 컨택포인트에 채워줍니다. 네이버 계정은 기본적으로
  아이디와 동일한 @naver.com 메일을 갖고 있어서, 실제 사용 여부와 별개로 유효한 컨택 채널일
  가능성이 높아요. 검색 결과 카드에 "예상 컨택"으로 미리 보여줍니다.

## 알아둘 점

- **중요**: 인스타그램의 해시태그 검색과 Business Discovery는 둘 다 "본인이 소유하지 않은
  계정"을 조회하는 기능이라, Meta의 **Advanced Access(정식 App Review) 승인**이 있어야
  정상 작동합니다. 승인 전에는 `(#10) To use 'Instagram Public Content Access'...` 같은
  에러가 납니다.
  - App Review는 비즈니스 인증, 라이브 모드 전환, 사용 화면 스크린캐스트 제출 등이 필요하고
    보통 1~4주 이상 걸리며, 반려될 수도 있습니다.
  - Meta가 명시한 승인 가능 용도는 "브랜드 해시태그 캠페인 모니터링", "고객 지원", "콘테스트
    응모자 확인" 등입니다. "인플루언서 발굴/조사" 용도는 이 목록에 없어서 반려 가능성이 있다는
    점을 참고해주세요.
  - 그래서 해시태그 검색 기능은 UI에서 뺐고, Business Discovery(username 일괄 조회)만 남겨서
    테스트해보실 수 있게 했습니다. 이것도 같은 에러가 나면, 승인 전까지는 인스타그램 자동
    조회 자체가 어렵다는 뜻입니다.
- Business Discovery는 순차 호출 + 300ms 딜레이를 넣어뒀습니다. 한 번에 너무 많은 username을
  넣으면 느려질 수 있으니 20~30개 단위로 나눠 조회하는 걸 추천합니다.
- `contact_dm` 필드에 이메일·DM·오픈채팅 등 컨택포인트를 자유 형식으로 기재하시면 됩니다.
  (이메일 전용 필드는 중복이라 제거했습니다.)
- 네이버 블로그는 이웃수·방문자수를 알려주는 공식 API가 없습니다. 검색 결과의 bloggerlink를
  열어 프로필에서 직접 확인 후, 등록 화면의 "이웃수" 칸에 입력하는 방식으로 운영해주세요
  (자동화된 크롤링은 이용약관 위반 소지가 있어 넣지 않았습니다).
