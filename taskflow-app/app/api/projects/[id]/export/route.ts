import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import * as XLSX from "xlsx";

function fmt(d: string | null) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}
function fmtDateTime(d: string | null) {
  if (!d) return "";
  const dt = new Date(d);
  return `${fmt(d)} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}
function durationLabel(start: string | null, end: string | null) {
  if (!start || !end) return "";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return "";
  const totalMinutes = Math.round(ms / 60000);
  return `${Math.floor(totalMinutes / 60)}시간 ${totalMinutes % 60}분`;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = createServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "manager") return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { data: project } = await db.from("projects").select("*").eq("id", params.id).single();
  if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });

  const { data: tasks } = await db
    .from("tasks")
    .select("*, category:category_id(label), episode:episode_id(label), manager:manager_id(name), assignments:task_assignments(*, contractor:contractor_id(name))")
    .eq("project_id", params.id)
    .eq("archived", false)
    .order("created_at", { ascending: true });

  const allStarts = (tasks ?? []).flatMap((t) => (t.assignments ?? []).map((a: any) => a.started_at)).filter(Boolean) as string[];
  const earliestStart = allStarts.length > 0 ? allStarts.sort()[0] : null;

  const rows: (string | number)[][] = [
    ["프로젝트명", project.name],
    ["등록일", fmt(project.created_at)],
    ["업무 시작일", fmtDateTime(earliestStart)],
    ["완료일", fmt(project.completed_at)],
    [],
    ["에피소드", "업무(카테고리)", "차수", "외주 작업자", "담당자", "시작일시", "종료일시", "작업시간", "평점", "인계 사유"],
  ];

  for (const t of tasks ?? []) {
    const segments = (t.assignments ?? []).sort((a: any, b: any) => a.created_at.localeCompare(b.created_at));
    segments.forEach((a: any, i: number) => {
      rows.push([
        t.episode?.label ?? "적용 안함",
        t.category?.label ?? "미지정",
        `${i + 1}차`,
        a.contractor?.name ?? "",
        t.manager?.name ?? "",
        fmtDateTime(a.started_at),
        fmtDateTime(a.ended_at),
        durationLabel(a.started_at, a.ended_at),
        a.rating ? `${a.rating}점` : "",
        a.handoff_reason ?? "",
      ]);
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 14 }, { wch: 16 }, { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 8 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "프로젝트 현황");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = encodeURIComponent(`${project.code}_${project.name}.xlsx`);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
