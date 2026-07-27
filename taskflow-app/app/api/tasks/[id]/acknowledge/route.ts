import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

// 외주 작업자가 재작업 요청 메시지를 확인 완료 처리 (이후 "수정 완료" 버튼이 노출됨).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = createServiceRoleClient();

  const { data: task } = await db.from("tasks").select("*").eq("id", params.id).single();
  if (!task) return NextResponse.json({ error: "업무를 찾을 수 없습니다." }, { status: 404 });
  if (task.contractor_id !== user.id) return NextResponse.json({ error: "본인 업무만 확인할 수 있습니다." }, { status: 403 });
  if (task.status !== "rework_notice") return NextResponse.json({ error: "재작업 대기 상태가 아닙니다." }, { status: 400 });

  const { error } = await db.from("tasks").update({ rework_acknowledged: true }).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
