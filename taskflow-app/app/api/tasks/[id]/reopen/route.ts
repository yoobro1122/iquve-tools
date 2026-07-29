import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { sendMail } from "@/lib/resend";
import { taskHandoffEmail, taskReassignedEmail } from "@/lib/email-templates";
import { notifyManagerStakeholders, checkAndWarnOutOfOrder } from "@/lib/task-notify";

// 완료(done)된 업무를 재오픈합니다. mode: 'rework'(같은 작업자에게 다시) | 'handoff'(다른 작업자에게 인계)
// body: { mode: 'rework' | 'handoff', new_contractor_id?: string, reason: string }
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = createServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("role,name").eq("id", user.id).single();
  if (profile?.role !== "manager") return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { mode, new_contractor_id, reason } = await req.json();
  if (!["rework", "handoff"].includes(mode)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  if (!reason?.trim()) return NextResponse.json({ error: "재작업/인계 사유를 입력해주세요." }, { status: 400 });

  const { data: task } = await db.from("tasks").select("*, project:project_id(name), episode:episode_id(label), contractor:contractor_id(name)").eq("id", params.id).single();
  if (!task) return NextResponse.json({ error: "업무를 찾을 수 없습니다." }, { status: 404 });
  if (task.status !== "done") return NextResponse.json({ error: "완료된 업무만 재작업 요청할 수 있습니다." }, { status: 400 });

  const targetContractorId = mode === "handoff" ? new_contractor_id : task.contractor_id;
  if (mode === "handoff" && !targetContractorId) return NextResponse.json({ error: "인계할 작업자를 선택해주세요." }, { status: 400 });

  const { data: targetContractor } = await db.from("profiles").select("email,name").eq("id", targetContractorId).single();
  if (!targetContractor) return NextResponse.json({ error: "작업자를 찾을 수 없습니다." }, { status: 404 });

  await db.from("task_assignments").insert({
    task_id: params.id, contractor_id: targetContractorId, is_rework: true, handoff_reason: reason.trim(),
  });
  await db.from("tasks").update({
    status: "waiting", contractor_id: targetContractorId, rework_acknowledged: false,
    reopen_count: (task.reopen_count ?? 0) + 1,
  }).eq("id", params.id);

  const taskLabel = task.episode?.label ?? "적용 안함";
  if (mode === "handoff") {
    const { subject, html } = taskHandoffEmail(task.project.name, taskLabel, targetContractor.name, reason.trim());
    await sendMail(targetContractor.email, subject, html);
  } else {
    const { subject, html } = taskReassignedEmail(task.project.name, taskLabel, targetContractor.name, reason.trim());
    await sendMail(targetContractor.email, subject, html);
  }
  await notifyManagerStakeholders(db, task.id, null, `[재작업 요청] "${taskLabel}" 완료 업무가 재작업으로 전환되었습니다`,
    `<p>업무 ${task.code}가 완료 후 재작업으로 전환되었습니다.</p><p>사유: ${reason.trim()}</p>`);

  await db.from("project_logs").insert({
    project_id: task.project_id, actor_id: user.id, actor_name: profile.name,
    change: `업무 ${task.code} 완료 후 재작업 - ${mode === "handoff" ? `${task.contractor.name} → ${targetContractor.name} (인계)` : "동일 작업자 재작업"} - 사유: ${reason.trim()}`,
  });

  await checkAndWarnOutOfOrder(db, task, taskLabel, task.project.name);

  return NextResponse.json({ ok: true });
}
