import { NextRequest, NextResponse } from "next/server";
import { searchYoutubeChannels } from "@/lib/youtube";

// GET /api/youtube/search?q=육아&minSubscribers=10000&maxResults=30&sort=subscribers_desc
// sort: subscribers_desc(기본) | subscribers_asc
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const minSubscribers = Number(searchParams.get("minSubscribers") ?? 0);
  // 유튜브 search.list 한 번 호출당 최대 50개까지 가능 (그 이상 필요하면 페이지네이션 필요)
  const maxResults = Math.min(Number(searchParams.get("maxResults") ?? 25), 50);
  const sort = searchParams.get("sort") ?? "subscribers_desc";

  if (!q) {
    return NextResponse.json({ error: "검색어(q)가 필요합니다." }, { status: 400 });
  }

  try {
    const channels = await searchYoutubeChannels(q, maxResults);
    let filtered = channels.filter((c) => c.subscriberCount >= minSubscribers);

    filtered =
      sort === "subscribers_asc"
        ? filtered.sort((a, b) => a.subscriberCount - b.subscriberCount)
        : filtered.sort((a, b) => b.subscriberCount - a.subscriberCount);

    return NextResponse.json({
      results: filtered,
      requestedCount: maxResults,
      returnedCount: channels.length,
      afterFilterCount: filtered.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
