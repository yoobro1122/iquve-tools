import { NextRequest, NextResponse } from "next/server";
import { getConfigStatuses, setConfig } from "@/lib/apiConfig";

// 이 목록에 있는 key만 저장/조회 허용 (임의 키 주입 방지)
const ALLOWED_KEYS = [
  "youtube_api_key",
  "ig_access_token",
  "ig_business_account_id",
  "hikerapi_access_key",
  "naver_client_id",
  "naver_client_secret",
] as const;

// GET /api/settings  - 각 키의 저장 여부/최종 수정일만 반환 (값 자체는 절대 반환하지 않음)
export async function GET() {
  try {
    const statuses = await getConfigStatuses([...ALLOWED_KEYS]);
    return NextResponse.json({ statuses });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/settings  - body: { key: string, value: string }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { key, value } = body;

  if (!ALLOWED_KEYS.includes(key)) {
    return NextResponse.json({ error: `허용되지 않은 키입니다: ${key}` }, { status: 400 });
  }
  if (!value || typeof value !== "string") {
    return NextResponse.json({ error: "value가 필요합니다." }, { status: 400 });
  }

  try {
    await setConfig(key, value);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
