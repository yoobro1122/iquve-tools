import { NextRequest, NextResponse } from "next/server";
import { getHashtagRecentMedia } from "@/lib/instagram";

// GET /api/instagram/hashtag-media?tag=육아
// username은 반환되지 않음 -> permalink를 열어 직접 확인 후 /api/instagram/discover 로 일괄 조회
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tag = searchParams.get("tag");

  if (!tag) {
    return NextResponse.json({ error: "해시태그(tag)가 필요합니다." }, { status: 400 });
  }

  try {
    const media = await getHashtagRecentMedia(tag);
    return NextResponse.json({
      results: media,
      notice:
        "Meta 정책상 게시물 소유 계정(username)은 API로 제공되지 않습니다. permalink를 열어 계정을 확인한 뒤 discover API에 입력하세요.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
