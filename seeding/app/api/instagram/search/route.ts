import { NextRequest, NextResponse } from "next/server";
import { searchInstagramAccounts } from "@/lib/hikerapi";

// GET /api/instagram/search?q=육아
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");

  if (!q) {
    return NextResponse.json({ error: "검색어(q)가 필요합니다." }, { status: 400 });
  }

  try {
    const results = await searchInstagramAccounts(q);
    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
