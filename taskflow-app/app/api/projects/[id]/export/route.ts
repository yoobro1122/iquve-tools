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
    .select("*, category:category_id(label), episode:episode_id(label), contractor:contractor_id(name), manager:manager_id(name)")
    .eq("project_id", params.id)
    .eq("archived", false)
    .order("created_at", { ascending: true });

  const startDates = (tasks ?? []).map((t) => t.start_date).filter(Boolean) as string[];
  const earliestStart = startDates.length > 0 ? startDates.sort()[0] : null;

  const rows: (string | number)[][] = [
    ["프로젝트명", project.name],
    ["등록일", fmt(project.created_at)],
    ["업무 시작일", fmtDateTime(earliestStart)],
    ["완료일", fmt(project.completed_at)],
    [],
    ["에피소드", "업무(카테고리)", "외주 작업자", "담당자", "시작일시", "종료일시", "작업시간", "평점"],
  ];

  for (const t of tasks ?? []) {
    rows.push([
      t.episode?.label ?? "적용 안함",
      t.category?.label ?? "",
      t.contractor?.name ?? "",
      t.manager?.name ?? "",
      fmtDateTime(t.start_date),
      fmtDateTime(t.completed_date),
      durationLabel(t.start_date, t.completed_date),
      t.rating ? `${t.rating}점` : "",
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 8 }];
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
