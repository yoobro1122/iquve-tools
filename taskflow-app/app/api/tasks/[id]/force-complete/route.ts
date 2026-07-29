import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { reviewApprovedEmail } from "@/lib/email-templates";
import { notifyManagerStakeholders, notifyOrderUnlock } from "@/lib/task-notify";

// 담당자가 작업자 대신 업무를 완료 처리합니다 (작업자가 완료를 안 누르는 경우 대비).
// 어떤 상태에서든 가능하며, 시작/종료 시각·평점은 기록하지 않고 비워둡니다.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = createServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("role,name").eq("id", user.id).single();
  if (profile?.role !== "manager") return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { reason } = await req.json();
  if (!reason?.trim()) return NextResponse.json({ error: "완료 처리 사유를 입력해주세요." }, { status: 400 });

  const { data: task } = await db.from("tasks").select("*, project:project_id(name), episode:episode_id(label), contractor:contractor_id(email,name), manager:manager_id(email)").eq("id", params.id).single();
  if (!task) return NextResponse.json({ error: "업무를 찾을 수 없습니다." }, { status: 404 });
  if (task.archived) return NextResponse.json({ error: "삭제된 업무는 처리할 수 없습니다." }, { status: 400 });
  if (task.status === "done") return NextResponse.json({ error: "이미 완료된 업무입니다." }, { status: 400 });

  const { error } = await db.from("tasks").update({ status: "done" }).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const taskLabel = task.episode?.label ?? "적용 안함";
  await db.from("project_logs").insert({
    project_id: task.project_id, actor_id: user.id, actor_name: profile.name,
    change: `업무 ${task.code} 담당자 강제 완료 처리 - 사유: ${reason.trim()}`,
  });

  if (task.contractor?.email) {
    const { subject, html } = reviewApprovedEmail(task.project.name, taskLabel);
    await notifyManagerStakeholders(db, task.id, task.manager?.email, subject, html);
  }

  await notifyOrderUnlock(db, task);

  return NextResponse.json({ ok: true });
}
