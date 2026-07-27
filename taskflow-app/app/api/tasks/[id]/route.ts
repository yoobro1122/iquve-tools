import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

// 업무 수정(카테고리/subheading/외주작업자) + 삭제(비활성화)/복원을 한 라우트에서 처리.
// body: { category_id?, subheading_id?, contractor_id? } -> 수정
// body: { archived: true|false } -> 삭제/복원
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = createServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("role,name").eq("id", user.id).single();
  if (profile?.role !== "manager") return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { data: task } = await db.from("tasks").select("*").eq("id", params.id).single();
  if (!task) return NextResponse.json({ error: "업무를 찾을 수 없습니다." }, { status: 404 });

  const body = await req.json();
  const changes: string[] = [];
  const patch: Record<string, unknown> = {};

  if (typeof body.archived === "boolean" && body.archived !== task.archived) {
    patch.archived = body.archived;
    changes.push(body.archived ? `업무 ${task.code} 삭제 처리 (비활성화)` : `업무 ${task.code} 복원 처리`);
  }
  if (body.category_id && body.category_id !== task.category_id) {
    const [{ data: oldCat }, { data: newCat }] = await Promise.all([
      db.from("categories").select("label").eq("id", task.category_id).single(),
      db.from("categories").select("label").eq("id", body.category_id).single(),
    ]);
    changes.push(`업무 ${task.code} 수정 - 카테고리: ${oldCat?.label} → ${newCat?.label}`);
    patch.category_id = body.category_id;
  }
  if (body.subheading_id && body.subheading_id !== task.subheading_id) {
    const [{ data: oldSub }, { data: newSub }] = await Promise.all([
      db.from("subheadings").select("label").eq("id", task.subheading_id).single(),
      db.from("subheadings").select("label").eq("id", body.subheading_id).single(),
    ]);
    changes.push(`업무 ${task.code} 수정 - subheading: ${oldSub?.label} → ${newSub?.label}`);
    patch.subheading_id = body.subheading_id;
  }
  if (body.contractor_id && body.contractor_id !== task.contractor_id) {
    const [{ data: oldC }, { data: newC }] = await Promise.all([
      db.from("profiles").select("name").eq("id", task.contractor_id).single(),
      db.from("profiles").select("name").eq("id", body.contractor_id).single(),
    ]);
    changes.push(`업무 ${task.code} 수정 - 외주 작업자: ${oldC?.name} → ${newC?.name}`);
    patch.contractor_id = body.contractor_id;
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ item: task });

  const { data: updated, error } = await db.from("tasks").update(patch).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  for (const c of changes) {
    await db.from("project_logs").insert({ project_id: task.project_id, actor_id: user.id, actor_name: profile.name, change: c });
  }

  return NextResponse.json({ item: updated });
}
