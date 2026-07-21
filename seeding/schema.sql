-- 인플루언서 DB 스키마
-- Supabase SQL Editor에서 실행하세요.

create table if not exists influencers (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('youtube', 'instagram', 'naver_blog')),
  handle text not null,               -- 유튜브 channelId, 인스타 username, 네이버 bloggerlink
  display_name text,
  followers_count integer,            -- 인스타: followers_count / 유튜브: subscriberCount / 네이버: 이웃수(수동 입력)
  category_tags text[] default '{}',  -- 예: {'육아','교육','키즈'}
  contact_dm text,                    -- 컨택포인트 (DM, 이메일, 오픈채팅 등 자유 기재)
  partnership_status text not null default '연락전'
    check (partnership_status in ('연락전', '협의중', '완료', '보류')),
  memo text,
  source_permalink text,              -- 인스타 발견 시 참고했던 게시물 링크 (검증용)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_influencers_platform on influencers(platform);
create index if not exists idx_influencers_status on influencers(partnership_status);
create index if not exists idx_influencers_followers on influencers(followers_count desc);

-- updated_at 자동 갱신 트리거
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_influencers_updated_at on influencers;
create trigger trg_influencers_updated_at
before update on influencers
for each row execute function set_updated_at();

-- API 키 저장용 테이블 (앱 설정 탭에서 입력, 이미 쓰고 계신 api_config 패턴과 동일)
create table if not exists api_config (
  key text primary key,   -- 예: 'youtube_api_key', 'ig_access_token', 'naver_client_id'
  value text not null,
  updated_at timestamptz default now()
);

-- 확인용 샘플 데이터 (원치 않으면 이 블록은 실행하지 않아도 됩니다)
insert into influencers (platform, handle, display_name, followers_count, category_tags, contact_dm, partnership_status, memo)
values ('instagram', 'sample_account', '샘플 계정', 12500, array['육아','그림책'], '인스타 DM 또는 sample@example.com', '연락전', '샘플 데이터입니다. 확인 후 삭제하세요.');


