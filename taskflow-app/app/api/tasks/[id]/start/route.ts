import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { taskStartedEmail } from "@/lib/email-templates";
import { notifyManagerStakeholders } from "@/lib/task-notify";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = createServiceRoleClient();

  const { data: task } = await db.from("tasks").select("*, project:project_id(name), episode:episode_id(label), contractor:contractor_id(name), manager:manager_id(email)").eq("id", params.id).single();
  if (!task) return NextResponse.json({ error: "업무를 찾을 수 없습니다." }, { status: 404 });
  if (task.contractor_id !== user.id) return NextResponse.json({ error: "본인 업무만 시작할 수 있습니다." }, { status: 403 });
  if (task.status !== "waiting") return NextResponse.json({ error: "이미 시작된 업무입니다." }, { status: 400 });

  // 카테고리 순서 확인: 같은 프로젝트+에피소드 안에서 앞 순서 카테고리의 업무가 아직 완료되지 않았다면 시작 불가
  if (task.episode_id && task.category_id) {
    const { data: myCat } = await db.from("categories").select("sort_order").eq("id", task.category_id).single();
    if (myCat) {
      const { data: siblings } = await db
        .from("tasks")
        .select("status, category:category_id(sort_order)")
        .eq("project_id", task.project_id)
        .eq("episode_id", task.episode_id)
        .eq("archived", false)
        .neq("id", task.id);
      const blockers = (siblings ?? []).filter((s: any) => s.category && s.category.sort_order < myCat.sort_order);
      if (blockers.some((s: any) => s.status !== "done")) {
        return NextResponse.json({ error: "이전 순서의 업무가 아직 완료되지 않아 시작할 수 없습니다." }, { status: 400 });
      }
    }
  }

  // 현재(최신) 배정 구간을 찾아 시작 시각 기록
  const { data: assignment } = await db
    .from("task_assignments")
    .select("*")
    .eq("task_id", params.id)
    .eq("contractor_id", user.id)
    .is("ended_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!assignment) return NextResponse.json({ error: "배정 구간을 찾을 수 없습니다." }, { status: 500 });

  await db.from("task_assignments").update({ started_at: new Date().toISOString() }).eq("id", assignment.id);
  const { error } = await db.from("tasks").update({ status: "in_progress" }).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { subject, html } = taskStartedEmail(task.project.name, task.episode?.label ?? "적용 안함", task.contractor.name);
  await notifyManagerStakeholders(db, task.id, task.manager?.email, subject, html);

  await db.from("project_logs").insert({ project_id: task.project_id, actor_id: user.id, actor_name: task.contractor.name, change: `업무 ${task.code} 시작` });

  return NextResponse.json({ ok: true });
}
