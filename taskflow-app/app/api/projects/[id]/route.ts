import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

async function requireManager() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const db = createServiceRoleClient();
  type Db = ReturnType<typeof createServiceRoleClient>;
  if (!user) return { error: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }), db: null as Db | null, user: null as any, profile: null as any };
  const { data: profile } = await db.from("profiles").select("role,name").eq("id", user.id).single();
  if (profile?.role !== "manager") return { error: NextResponse.json({ error: "권한이 없습니다." }, { status: 403 }), db: null as Db | null, user: null as any, profile: null as any };
  return { error: null as NextResponse | null, db, user, profile };
}

// 프로젝트 수정 (넘버/이름) + 삭제(비활성화, 소프트 삭제)를 한 라우트에서 처리.
// body: { code, name } -> 수정  |  { archived: true } -> 삭제(비활성화)  |  { archived: false } -> 복원
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const r = await requireManager();
  if (r.error) return r.error;
  const { db, user, profile } = r;

  const { data: project } = await db!.from("projects").select("*").eq("id", params.id).single();
  if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });

  const body = await req.json();
  const changes: string[] = [];
  const patch: Record<string, unknown> = {};

  if (typeof body.archived === "boolean" && body.archived !== project.archived) {
    patch.archived = body.archived;
    changes.push(body.archived ? "프로젝트 삭제 처리 (비활성화)" : "프로젝트 복원 처리");
  }
  if (typeof body.code === "string" && body.code.trim() && body.code.trim() !== project.code) {
    const { data: dup } = await db!.from("projects").select("id").eq("major_category_id", project.major_category_id).eq("code", body.code.trim()).neq("id", project.id).maybeSingle();
    if (dup) return NextResponse.json({ error: "이미 사용 중인 프로젝트 넘버입니다." }, { status: 409 });
    changes.push(`프로젝트 넘버: ${project.code} → ${body.code.trim()}`);
    patch.code = body.code.trim();
  }
  if (typeof body.name === "string" && body.name.trim() && body.name.trim() !== project.name) {
    const { data: dup } = await db!.from("projects").select("id").eq("major_category_id", project.major_category_id).eq("name", body.name.trim()).neq("id", project.id).maybeSingle();
    if (dup) return NextResponse.json({ error: "이미 사용 중인 프로젝트명입니다." }, { status: 409 });
    changes.push(`프로젝트명: ${project.name} → ${body.name.trim()}`);
    patch.name = body.name.trim();
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ item: project });

  const { data: updated, error } = await db!.from("projects").update(patch).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  for (const c of changes) {
    await db!.from("project_logs").insert({ project_id: params.id, actor_id: user!.id, actor_name: profile!.name, change: c });
  }

  return NextResponse.json({ item: updated });
}

// 완전 삭제: 이미 비활성화(archived=true) 상태인 프로젝트만 DB에서 영구 삭제할 수 있습니다.
// (하위 에피소드/업무/업무로그는 on delete cascade로 함께 삭제됩니다.)
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const r = await requireManager();
  if (r.error) return r.error;

  const { data: project } = await r.db!.from("projects").select("*").eq("id", params.id).single();
  if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  if (!project.archived) return NextResponse.json({ error: "삭제(비활성화)된 프로젝트만 완전 삭제할 수 있습니다." }, { status: 400 });

  const { error } = await r.db!.from("projects").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
