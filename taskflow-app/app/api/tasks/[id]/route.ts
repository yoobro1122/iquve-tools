import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { sendMail } from "@/lib/resend";
import { taskReassignedEmail } from "@/lib/email-templates";

// 업무 수정(카테고리/에피소드/외주작업자/담당자/메모) + 삭제(비활성화)/복원을 한 라우트에서 처리.
// body: { category_id?, episode_id?, contractor_id?, manager_id?, memo? } -> 수정
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
  let reassignedContractorId: string | null = null;

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
  if ("episode_id" in body && (body.episode_id || null) !== task.episode_id) {
    const newEpId = body.episode_id || null;
    let oldLabel = "적용 안함";
    let newLabel = "적용 안함";
    if (task.episode_id) {
      const { data: oldEp } = await db.from("episodes").select("label").eq("id", task.episode_id).single();
      oldLabel = oldEp?.label ?? oldLabel;
    }
    if (newEpId) {
      const { data: newEp } = await db.from("episodes").select("label").eq("id", newEpId).single();
      newLabel = newEp?.label ?? newLabel;
    }
    changes.push(`업무 ${task.code} 수정 - 에피소드: ${oldLabel} → ${newLabel}`);
    patch.episode_id = newEpId;
  }
  if (body.contractor_id && body.contractor_id !== task.contractor_id) {
    const [{ data: oldC }, { data: newC }] = await Promise.all([
      db.from("profiles").select("name").eq("id", task.contractor_id).single(),
      db.from("profiles").select("name,email").eq("id", body.contractor_id).single(),
    ]);
    changes.push(`업무 ${task.code} 수정 - 외주 작업자: ${oldC?.name} → ${newC?.name}`);
    patch.contractor_id = body.contractor_id;
    reassignedContractorId = body.contractor_id;
  }
  if (body.manager_id && body.manager_id !== task.manager_id) {
    const [{ data: oldM }, { data: newM }] = await Promise.all([
      task.manager_id ? db.from("profiles").select("name").eq("id", task.manager_id).single() : Promise.resolve({ data: null }),
      db.from("profiles").select("name").eq("id", body.manager_id).single(),
    ]);
    changes.push(`업무 ${task.code} 수정 - 담당자: ${oldM?.name ?? "미지정"} → ${newM?.name}`);
    patch.manager_id = body.manager_id;
  }
  if (typeof body.memo === "string" && body.memo !== task.memo) {
    changes.push(`업무 ${task.code} 메모 수정`);
    patch.memo = body.memo;
  }
  if (typeof body.rating === "number" && body.rating !== task.rating) {
    if (body.rating < 1 || body.rating > 5) return NextResponse.json({ error: "평점은 1~5 사이여야 합니다." }, { status: 400 });
    changes.push(`업무 ${task.code} 평점: ${task.rating ?? "-"} → ${body.rating}`);
    patch.rating = body.rating;
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ item: task });

  const { data: updated, error } = await db.from("tasks").update(patch).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  for (const c of changes) {
    await db.from("project_logs").insert({ project_id: task.project_id, actor_id: user.id, actor_name: profile.name, change: c });
  }

  if (reassignedContractorId) {
    const [{ data: project }, { data: episode }, { data: contractor }] = await Promise.all([
      db.from("projects").select("name").eq("id", task.project_id).single(),
      updated.episode_id ? db.from("episodes").select("label").eq("id", updated.episode_id).single() : Promise.resolve({ data: null }),
      db.from("profiles").select("email,name").eq("id", reassignedContractorId).single(),
    ]);
    if (project && contractor) {
      const { subject, html } = taskReassignedEmail(project.name, episode?.label ?? "적용 안함", contractor.name, updated.memo);
      await sendMail(contractor.email, subject, html);
    }
  }

  return NextResponse.json({ item: updated });
}

// 완전 삭제: 이미 비활성화(archived=true) 상태인 업무만 DB에서 영구 삭제할 수 있습니다.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = createServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "manager") return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { data: task } = await db.from("tasks").select("*").eq("id", params.id).single();
  if (!task) return NextResponse.json({ error: "업무를 찾을 수 없습니다." }, { status: 404 });
  if (!task.archived) return NextResponse.json({ error: "삭제(비활성화)된 업무만 완전 삭제할 수 있습니다." }, { status: 400 });

  const { error } = await db.from("tasks").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
