import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { subManagerAckEmail } from "@/lib/email-templates";
import { sendMail } from "@/lib/resend";

// 서브 담당자(참조)가 업무를 확인하고 의견을 남깁니다. 검수 권한은 없으며,
// 확인 처리 시 메인 담당자에게 알림 메일이 발송됩니다.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = createServiceRoleClient();

  const { data: subRow } = await db.from("task_sub_managers").select("*").eq("task_id", params.id).eq("manager_id", user.id).maybeSingle();
  if (!subRow) return NextResponse.json({ error: "이 업무의 서브 담당자가 아닙니다." }, { status: 403 });

  const { comment } = await req.json().catch(() => ({ comment: "" }));

  const { error } = await db.from("task_sub_managers").update({ acknowledged: true, comment: comment ?? "" }).eq("id", subRow.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: task } = await db.from("tasks").select("*, project:project_id(name), episode:episode_id(label), manager:manager_id(email)").eq("id", params.id).single();
  const { data: me } = await db.from("profiles").select("name").eq("id", user.id).single();
  if (task?.manager?.email) {
    const { subject, html } = subManagerAckEmail(task.project.name, task.episode?.label ?? "적용 안함", me?.name ?? "서브 담당자", comment ?? "");
    await sendMail(task.manager.email, subject, html);
  }

  if (task) {
    await db.from("project_logs").insert({
      project_id: task.project_id, actor_id: user.id, actor_name: me?.name ?? "서브 담당자",
      change: `업무 ${task.code} 서브 담당자 확인${comment?.trim() ? ` - ${comment.trim()}` : ""}`,
    });
  }

  return NextResponse.json({ ok: true });
}
