import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { sendMail } from "@/lib/resend";
import { publishDecidedEmail } from "@/lib/email-templates";

// body: { decision: 'confirm' | 'decline', reason?: string }
// '확인 완료' 상태(모든 업무 완료 + 검수상태 Complete(Kor))일 때만 허용.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = createServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("role,name").eq("id", user.id).single();
  if (profile?.role !== "manager") return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { data: project } = await db.from("projects").select("*").eq("id", params.id).single();
  if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });

  const { data: tasks } = await db.from("tasks").select("status,contractor_id").eq("project_id", params.id).eq("archived", false);
  const allDone = (tasks?.length ?? 0) > 0 && tasks!.every((t) => t.status === "done");
  if (!allDone || project.review_status !== "Complete(Kor)")
    return NextResponse.json({ error: "모든 업무 완료 + 검수 상태 Complete(Kor)일 때만 게시 여부를 결정할 수 있습니다." }, { status: 400 });

  const { decision, reason } = await req.json();
  if (!["confirm", "decline"].includes(decision))
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const patch: Record<string, unknown> = decision === "confirm"
    ? { upload_decision: "confirmed", decline_reason: "" }
    : { upload_decision: "declined", decline_reason: reason ?? "" };

  const { data: updated, error } = await db.from("projects").update(patch).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from("project_logs").insert({
    project_id: params.id, actor_id: user.id, actor_name: profile.name,
    change: decision === "confirm" ? "게재 확인 처리 (서비스 노출 완료)" : `게재 불가 처리 - 사유: ${reason ?? ""}`,
  });

  // 관련 외주 작업자 전원에게 안내 메일 (중복 이메일 제거)
  const contractorIds = Array.from(new Set((tasks ?? []).map((t) => t.contractor_id)));
  if (contractorIds.length > 0) {
    const { data: contractors } = await db.from("profiles").select("email").in("id", contractorIds);
    const { subject, html } = publishDecidedEmail(project.name, decision === "confirm" ? "confirmed" : "declined", reason);
    for (const c of contractors ?? []) {
      await sendMail(c.email, subject, html);
    }
  }

  return NextResponse.json({ item: updated });
}
