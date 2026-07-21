import { NextRequest, NextResponse } from "next/server";
import { searchYoutubeChannels } from "@/lib/youtube";
import { getSupabaseServer } from "@/lib/supabase";

// GET /api/youtube/search?q=육아&minSubscribers=10000&maxResults=30&sort=subscribers_desc
// sort: subscribers_desc(기본) | subscribers_asc | recent_upload
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

    // 이미 DB에 등록된 채널은 검색 결과에서 제외
    const supabase = getSupabaseServer();
    const { data: existing } = await supabase
      .from("influencers")
      .select("handle")
      .eq("platform", "youtube");
    const existingHandles = new Set((existing ?? []).map((r: any) => r.handle));
    filtered = filtered.filter((c) => !existingHandles.has(c.channelId));

    if (sort === "subscribers_asc") {
      filtered = filtered.sort((a, b) => a.subscriberCount - b.subscriberCount);
    } else if (sort === "recent_upload") {
      filtered = filtered.sort((a, b) => {
        if (!a.lastUploadAt) return 1;
        if (!b.lastUploadAt) return -1;
        return new Date(b.lastUploadAt).getTime() - new Date(a.lastUploadAt).getTime();
      });
    } else {
      filtered = filtered.sort((a, b) => b.subscriberCount - a.subscriberCount);
    }

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
