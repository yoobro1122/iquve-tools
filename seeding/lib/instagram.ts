// Instagram Graph API 헬퍼
// 토큰/계정ID는 앱 "설정" 탭에서 입력 -> Supabase api_config 테이블에 저장된 값을 사용합니다.
//
// 중요 제약 (Meta 정책):
// - 해시태그 recent_media/top_media는 username을 반환하지 않음 (PII 미포함 정책)
// - 계정당 7일 이내 최대 30개 고유 해시태그 조회 가능
// - Business Discovery는 username을 "알고 있을 때"만 사용 가능

import { requireConfig } from "./apiConfig";

const GRAPH_BASE = "https://graph.facebook.com/v22.0";

export interface HashtagMediaItem {
  id: string;
  caption: string | null;
  mediaType: string;
  permalink: string;
  timestamp: string;
  likeCount: number;
  commentsCount: number;
}

// 1단계(자동): 해시태그로 최근 게시물 메타데이터 수집
// username은 포함되지 않으므로, permalink를 열어 사람이 직접 확인해야 함
export async function getHashtagRecentMedia(
  hashtag: string,
  limit = 30
): Promise<HashtagMediaItem[]> {
  const token = await requireConfig("ig_access_token", "IG_ACCESS_TOKEN");
  const igUserId = await requireConfig("ig_business_account_id", "IG_BUSINESS_ACCOUNT_ID");

  // 해시태그 -> hashtag_id
  const hashtagSearchUrl = `${GRAPH_BASE}/ig_hashtag_search?user_id=${igUserId}&q=${encodeURIComponent(
    hashtag
  )}&access_token=${token}`;
  const hashtagRes = await fetch(hashtagSearchUrl);
  if (!hashtagRes.ok) {
    throw new Error(`해시태그 검색 실패: ${hashtagRes.status} ${await hashtagRes.text()}`);
  }
  const hashtagData = await hashtagRes.json();
  const hashtagId = hashtagData.data?.[0]?.id;
  if (!hashtagId) return [];

  // 최근 게시물 조회 (username 필드는 요청 불가)
  const mediaUrl = `${GRAPH_BASE}/${hashtagId}/recent_media?user_id=${igUserId}&fields=id,caption,media_type,permalink,timestamp,like_count,comments_count&limit=${limit}&access_token=${token}`;
  const mediaRes = await fetch(mediaUrl);
  if (!mediaRes.ok) {
    throw new Error(`게시물 조회 실패: ${mediaRes.status} ${await mediaRes.text()}`);
  }
  const mediaData = await mediaRes.json();

  return (mediaData.data ?? []).map((item: any) => ({
    id: item.id,
    caption: item.caption ?? null,
    mediaType: item.media_type,
    permalink: item.permalink,
    timestamp: item.timestamp,
    likeCount: Number(item.like_count ?? 0),
    commentsCount: Number(item.comments_count ?? 0),
  }));
}

export interface BusinessDiscoveryError {
  username: string;
  reason: string;
}

export interface DiscoverBusinessAccountsResult {
  results: BusinessDiscoveryResult[];
  errors: BusinessDiscoveryError[];
  filteredByMinFollowers: string[]; // 조회는 됐지만 최소 팔로워수 미달로 제외된 username
}

// 2단계(자동): username을 알고 있는 계정들을 일괄 조회
// -> 팔로워수 + 최근 활동일 기준으로 필터링 가능
// 실패 원인을 삼키지 않고 errors 배열로 반환합니다 (원인 파악용).
export async function discoverBusinessAccounts(
  usernames: string[],
  opts: { minFollowers?: number; activeWithinDays?: number } = {}
): Promise<DiscoverBusinessAccountsResult> {
  const token = await requireConfig("ig_access_token", "IG_ACCESS_TOKEN");
  const igUserId = await requireConfig("ig_business_account_id", "IG_BUSINESS_ACCOUNT_ID");

  const minFollowers = opts.minFollowers ?? 0;
  const activeWithinDays = opts.activeWithinDays ?? 7;
  const cutoff = Date.now() - activeWithinDays * 24 * 60 * 60 * 1000;

  const results: BusinessDiscoveryResult[] = [];
  const errors: BusinessDiscoveryError[] = [];
  const filteredByMinFollowers: string[] = [];

  // Business Discovery는 계정당 1개씩 순차 조회 (Meta 권장: 과도한 호출 시 딜레이 필요)
  for (const username of usernames) {
    try {
      const fields = `business_discovery.username(${username}){username,name,biography,followers_count,media_count,media.limit(5){timestamp}}`;
      const url = `${GRAPH_BASE}/${igUserId}?fields=${encodeURIComponent(
        fields
      )}&access_token=${token}`;
      const res = await fetch(url);

      if (!res.ok) {
        const errBody = await res.text();
        let reason = `HTTP ${res.status}`;
        try {
          const parsed = JSON.parse(errBody);
          reason = parsed.error?.message ?? reason;
        } catch {
          reason = errBody || reason;
        }
        errors.push({ username, reason });
        continue;
      }

      const data = await res.json();
      const bd = data.business_discovery;
      if (!bd) {
        errors.push({
          username,
          reason: "business_discovery 데이터 없음 (비즈니스/크리에이터 계정이 아니거나 존재하지 않는 계정일 수 있음)",
        });
        continue;
      }

      const lastMediaTimestamp = bd.media?.data?.[0]?.timestamp ?? null;
      const isRecentlyActive = lastMediaTimestamp
        ? new Date(lastMediaTimestamp).getTime() >= cutoff
        : false;
      const followersCount = Number(bd.followers_count ?? 0);

      if (followersCount < minFollowers) {
        filteredByMinFollowers.push(username);
        continue;
      }

      results.push({
        username: bd.username,
        name: bd.name ?? null,
        biography: bd.biography ?? null,
        followersCount,
        mediaCount: Number(bd.media_count ?? 0),
        lastMediaTimestamp,
        isRecentlyActive,
      });

      // 호출 간 약간의 딜레이 (레이트리밋 보호)
      await new Promise((r) => setTimeout(r, 300));
    } catch (err: any) {
      errors.push({ username, reason: err?.message ?? "알 수 없는 에러" });
    }
  }

  return { results, errors, filteredByMinFollowers };
}
