// YouTube Data API v3 헬퍼
// API 키는 앱 "설정" 탭에서 입력 -> Supabase api_config 테이블에 저장된 값을 사용합니다.

import { requireConfig } from "./apiConfig";

const YT_BASE = "https://www.googleapis.com/youtube/v3";

export interface YoutubeChannelResult {
  channelId: string;
  title: string;
  description: string; // 채널 소개글
  thumbnail: string;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
  lastUploadAt: string | null;
}

// 키워드로 채널 검색 (search.list) 후 채널 상세(channels.list)로 구독자수 등 보강,
// 채널별 최신 영상 게시일까지 조회.
// 주의: 채널마다 최근 업로드일 조회에 100 units씩 추가로 듭니다.
// (search.list 100 + channels.list 1 + 채널당 100 units)
export async function searchYoutubeChannels(
  query: string,
  maxResults = 15
): Promise<YoutubeChannelResult[]> {
  const apiKey = await requireConfig("youtube_api_key", "YOUTUBE_API_KEY");

  // 1) 키워드로 채널 검색 -> channelId 목록 확보 (100 units)
  const searchUrl = `${YT_BASE}/search?part=snippet&type=channel&q=${encodeURIComponent(
    query
  )}&maxResults=${maxResults}&key=${apiKey}`;
  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) {
    throw new Error(`YouTube search 실패: ${searchRes.status} ${await searchRes.text()}`);
  }
  const searchData = await searchRes.json();
  const channelIds: string[] = (searchData.items ?? [])
    .map((item: any) => item.snippet?.channelId ?? item.id?.channelId)
    .filter(Boolean);

  if (channelIds.length === 0) return [];

  // 2) 채널 상세 정보 일괄 조회 (1 unit)
  const channelsUrl = `${YT_BASE}/channels?part=snippet,statistics&id=${channelIds.join(
    ","
  )}&key=${apiKey}`;
  const channelsRes = await fetch(channelsUrl);
  if (!channelsRes.ok) {
    throw new Error(`YouTube channels 조회 실패: ${channelsRes.status}`);
  }
  const channelsData = await channelsRes.json();

  // 3) 채널별 최신 영상 게시일 (채널당 100 units)
  const results: YoutubeChannelResult[] = await Promise.all(
    (channelsData.items ?? []).map(async (ch: any) => {
      let lastUploadAt: string | null = null;
      try {
        const latestUrl = `${YT_BASE}/search?part=snippet&channelId=${ch.id}&order=date&maxResults=1&type=video&key=${apiKey}`;
        const latestRes = await fetch(latestUrl);
        if (latestRes.ok) {
          const latestData = await latestRes.json();
          lastUploadAt = latestData.items?.[0]?.snippet?.publishedAt ?? null;
        }
      } catch {
        // 최근 업로드일 조회 실패는 무시 (핵심 정보 아님)
      }

      return {
        channelId: ch.id,
        title: ch.snippet?.title ?? "",
        description: ch.snippet?.description ?? "",
        thumbnail: ch.snippet?.thumbnails?.default?.url ?? "",
        subscriberCount: Number(ch.statistics?.subscriberCount ?? 0),
        viewCount: Number(ch.statistics?.viewCount ?? 0),
        videoCount: Number(ch.statistics?.videoCount ?? 0),
        lastUploadAt,
      };
    })
  );

  return results;
}
