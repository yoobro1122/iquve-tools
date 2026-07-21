import { NextRequest, NextResponse } from "next/server";
import { discoverBusinessAccounts } from "@/lib/instagram";

// POST /api/instagram/discover
// body: { usernames: string[], minFollowers?: number, activeWithinDays?: number }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const usernames: string[] = body.usernames ?? [];
  const minFollowers: number = body.minFollowers ?? 0;
  const activeWithinDays: number = body.activeWithinDays ?? 7;

  if (!Array.isArray(usernames) || usernames.length === 0) {
    return NextResponse.json({ error: "usernames 배열이 필요합니다." }, { status: 400 });
  }

  try {
    const results = await discoverBusinessAccounts(usernames, {
      minFollowers,
      activeWithinDays,
    });
    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
