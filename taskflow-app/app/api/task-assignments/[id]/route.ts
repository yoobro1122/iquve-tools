import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

// 배정 구간(작업자별 세그먼트)에 평점을 매깁니다. 종료된(ended_at이 있는) 구간에만 매길 수 있습니다.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = createServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "manager") return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { data: assignment } = await db.from("task_assignments").select("*").eq("id", params.id).single();
  if (!assignment) return NextResponse.json({ error: "배정 구간을 찾을 수 없습니다." }, { status: 404 });
  if (!assignment.ended_at) return NextResponse.json({ error: "종료된 구간만 평가할 수 있습니다." }, { status: 400 });

  const { rating } = await req.json();
  if (typeof rating !== "number" || rating < 1 || rating > 5)
    return NextResponse.json({ error: "평점은 1~5 사이여야 합니다." }, { status: 400 });

  const { data: updated, error } = await db.from("task_assignments").update({ rating }).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ item: updated });
}
