import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

// 음량확인 / 프로젝트 업로드 / 검수 상태 수정.
// 업로드=Complete, 검수=Complete(Kor) 로의 변경은 해당 프로젝트의 모든 업무가 '완료' 상태일 때만 허용합니다.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = createServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("role,name").eq("id", user.id).single();
  if (profile?.role !== "manager") return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { data: project } = await db.from("projects").select("*").eq("id", params.id).single();
  if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });

  const { data: tasks } = await db.from("tasks").select("status").eq("project_id", params.id).eq("archived", false);
  const allDone = (tasks?.length ?? 0) > 0 && tasks!.every((t) => t.status === "done");

  const { volume_check, upload_status, review_status } = await req.json();
  const changes: string[] = [];
  const patch: Record<string, unknown> = {};

  if (volume_check && volume_check !== project.volume_check) {
    changes.push(`음량 확인: ${project.volume_check} → ${volume_check}`);
    patch.volume_check = volume_check;
  }
  if (upload_status && upload_status !== project.upload_status) {
    if (upload_status === "Complete" && !allDone)
      return NextResponse.json({ error: "모든 업무가 완료되어야 업로드를 Complete로 바꿀 수 있습니다." }, { status: 400 });
    changes.push(`프로젝트 업로드: ${project.upload_status} → ${upload_status}`);
    patch.upload_status = upload_status;
    if (upload_status === "Complete" && !project.completed_at) patch.completed_at = new Date().toISOString();
  }
  if (review_status && review_status !== project.review_status) {
    if (review_status === "Complete(Kor)" && !allDone)
      return NextResponse.json({ error: "모든 업무가 완료되어야 검수 상태를 Complete(Kor)로 바꿀 수 있습니다." }, { status: 400 });
    changes.push(`검수 상태: ${project.review_status} → ${review_status}`);
    patch.review_status = review_status;
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ item: project });

  const { data: updated, error } = await db.from("projects").update(patch).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  for (const c of changes) {
    await db.from("project_logs").insert({ project_id: params.id, actor_id: user.id, actor_name: profile.name, change: c });
  }

  return NextResponse.json({ item: updated });
}
