import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { sendMail } from "@/lib/resend";
import { taskAssignedEmail } from "@/lib/email-templates";
import { notifyManagerStakeholders } from "@/lib/task-notify";

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = createServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("role,name").eq("id", user.id).single();
  if (profile?.role !== "manager") return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { project_id, category_id, episode_id, contractor_id, manager_id, sub_manager_ids, planned_start_date, memo } = await req.json();
  if (!project_id || !category_id || !contractor_id)
    return NextResponse.json({ error: "카테고리와 외주 작업자를 선택해주세요." }, { status: 400 });

  const nowIso = new Date().toISOString();
  const scheduledIso: string = planned_start_date ? new Date(planned_start_date).toISOString() : nowIso;
  const isImmediate = scheduledIso <= nowIso;
  const mainManagerId = manager_id || user.id;

  const { count } = await db.from("tasks").select("id", { count: "exact", head: true }).eq("project_id", project_id);
  const code = "W" + String((count ?? 0) + 1).padStart(3, "0");

  const { data: task, error } = await db.from("tasks").insert({
    project_id, category_id, episode_id: episode_id || null, contractor_id,
    manager_id: mainManagerId,
    planned_start_date: scheduledIso,
    memo: memo || "",
    start_notice_sent: isImmediate,
    code,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 첫 배정 구간 생성 (인계 시마다 새 구간이 추가됨)
  await db.from("task_assignments").insert({ task_id: task.id, contractor_id });

  // 서브 담당자(참조) 등록
  const subIds: string[] = Array.isArray(sub_manager_ids) ? sub_manager_ids.filter((id: string) => id && id !== mainManagerId) : [];
  if (subIds.length > 0) {
    await db.from("task_sub_managers").insert(subIds.map((manager_id) => ({ task_id: task.id, manager_id })));
  }

  await db.from("project_logs").insert({
    project_id, actor_id: user.id, actor_name: profile.name, change: `업무 ${code} 신규 등록`,
  });

  if (isImmediate) {
    const [{ data: project }, { data: episode }, { data: contractor }, { data: mainManager }] = await Promise.all([
      db.from("projects").select("name").eq("id", project_id).single(),
      episode_id ? db.from("episodes").select("label").eq("id", episode_id).single() : Promise.resolve({ data: null }),
      db.from("profiles").select("email,name").eq("id", contractor_id).single(),
      db.from("profiles").select("email").eq("id", mainManagerId).single(),
    ]);
    if (project && contractor) {
      const { subject, html } = taskAssignedEmail(project.name, episode?.label ?? "적용 안함", contractor.name, memo);
      await sendMail(contractor.email, subject, html);
      await notifyManagerStakeholders(db, task.id, mainManager?.email, subject, html);
    }
  }

  return NextResponse.json({ item: task });
}
