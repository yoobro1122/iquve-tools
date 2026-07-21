import { NextRequest, NextResponse } from "next/server";
import { searchYoutubeChannels } from "@/lib/youtube";

// GET /api/youtube/search?q=육아&minSubscribers=10000
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const minSubscribers = Number(searchParams.get("minSubscribers") ?? 0);

  if (!q) {
    return NextResponse.json({ error: "검색어(q)가 필요합니다." }, { status: 400 });
  }

  try {
    const channels = await searchYoutubeChannels(q);
    const filtered = channels
      .filter((c) => c.subscriberCount >= minSubscribers)
      .sort((a, b) => b.subscriberCount - a.subscriberCount);

    return NextResponse.json({ results: filtered });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
