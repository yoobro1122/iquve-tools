import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { sendMail } from "@/lib/resend";
import { reviewApprovedEmail, reworkRequestedEmail, taskHandoffEmail } from "@/lib/email-templates";
import { notifyManagerStakeholders } from "@/lib/task-notify";

// body:
//   { result: 'pass' }
//   { result: 'reject', note: string }
//   { result: 'handoff', new_contractor_id: string, note: string }
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = createServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("role,name").eq("id", user.id).single();
  if (profile?.role !== "manager") return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { result, note, new_contractor_id } = await req.json();
  if (!["pass", "reject", "handoff"].includes(result)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const { data: task } = await db.from("tasks").select("*, project:project_id(name), episode:episode_id(label), contractor:contractor_id(email,name), manager:manager_id(email)").eq("id", params.id).single();
  if (!task) return NextResponse.json({ error: "업무를 찾을 수 없습니다." }, { status: 404 });
  if (task.status !== "reviewing") return NextResponse.json({ error: "현재 검수 대기 상태가 아닙니다." }, { status: 400 });

  const { data: assignment } = await db
    .from("task_assignments")
    .select("*")
    .eq("task_id", params.id)
    .eq("contractor_id", task.contractor_id)
    .is("ended_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!assignment) return NextResponse.json({ error: "배정 구간을 찾을 수 없습니다." }, { status: 500 });

  if (result === "pass") {
    await db.from("task_assignments").update({ ended_at: new Date().toISOString() }).eq("id", assignment.id);
    await db.from("tasks").update({ status: "done" }).eq("id", params.id);
    const { subject, html } = reviewApprovedEmail(task.project.name, task.episode?.label ?? "적용 안함");
    await sendMail(task.contractor.email, subject, html);
    await notifyManagerStakeholders(db, task.id, task.manager?.email, subject, html);
    await db.from("project_logs").insert({ project_id: task.project_id, actor_id: user.id, actor_name: profile.name, change: `업무 ${task.code} 검수 확인 → 완료` });
  } else if (result === "reject") {
    await db.from("tasks").update({ status: "rework_notice", rework_acknowledged: false }).eq("id", params.id);
    await db.from("task_rework_notes").insert({ task_id: params.id, message: note ?? "" });
    const { subject, html } = reworkRequestedEmail(task.project.name, task.episode?.label ?? "적용 안함", note ?? "");
    await sendMail(task.contractor.email, subject, html);
    await notifyManagerStakeholders(db, task.id, task.manager?.email, subject, html);
    await db.from("project_logs").insert({ project_id: task.project_id, actor_id: user.id, actor_name: profile.name, change: `업무 ${task.code} 재작업 요청 - ${note ?? ""}` });
  } else {
    // handoff: 다른 작업자에게 인계
    if (!new_contractor_id) return NextResponse.json({ error: "인계할 작업자를 선택해주세요." }, { status: 400 });
    if (!note?.trim()) return NextResponse.json({ error: "인계 사유를 입력해주세요." }, { status: 400 });

    const { data: newContractor } = await db.from("profiles").select("email,name").eq("id", new_contractor_id).single();
    if (!newContractor) return NextResponse.json({ error: "작업자를 찾을 수 없습니다." }, { status: 404 });

    await db.from("task_assignments").update({ ended_at: new Date().toISOString(), handoff_reason: note.trim() }).eq("id", assignment.id);
    await db.from("task_assignments").insert({ task_id: params.id, contractor_id: new_contractor_id });
    await db.from("tasks").update({ status: "waiting", contractor_id: new_contractor_id, rework_acknowledged: false }).eq("id", params.id);

    const { subject, html } = taskHandoffEmail(task.project.name, task.episode?.label ?? "적용 안함", newContractor.name, note.trim());
    await sendMail(newContractor.email, subject, html);
    await notifyManagerStakeholders(db, task.id, task.manager?.email, subject, html);
    await db.from("project_logs").insert({
      project_id: task.project_id, actor_id: user.id, actor_name: profile.name,
      change: `업무 ${task.code} 인계 - ${task.contractor.name} → ${newContractor.name} (사유: ${note.trim()})`,
    });
  }

  return NextResponse.json({ ok: true });
}
