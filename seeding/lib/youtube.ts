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
}

// 키워드로 채널 검색 (search.list) 후 채널 상세(channels.list)로 구독자수 등 보강
// 채널당 추가 조회 없이 search.list(100 units) + channels.list(1 unit)만 사용해서
// 쿼터를 최소로 씁니다.
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

  return (channelsData.items ?? []).map((ch: any) => ({
    channelId: ch.id,
    title: ch.snippet?.title ?? "",
    description: ch.snippet?.description ?? "",
    thumbnail: ch.snippet?.thumbnails?.default?.url ?? "",
    subscriberCount: Number(ch.statistics?.subscriberCount ?? 0),
    viewCount: Number(ch.statistics?.viewCount ?? 0),
    videoCount: Number(ch.statistics?.videoCount ?? 0),
  }));
}
