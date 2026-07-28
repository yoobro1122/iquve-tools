export type Role = "manager" | "contractor";

export type TaskStatus = "waiting" | "in_progress" | "reviewing" | "rework_notice" | "done";

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  waiting: "대기중",
  in_progress: "작업 중",
  reviewing: "검수 중",
  rework_notice: "재작업 확인 대기",
  done: "완료",
};

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: Role;
  specialty: string;
  note: string;
  must_change_password: boolean;
}

export interface MajorCategory {
  id: string;
  label: string;
  sort_order: number;
}

export interface Category {
  id: string;
  label: string;
}

export interface Episode {
  id: string;
  project_id: string;
  label: string;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  major_category_id: string;
  volume_check: "Checking" | "Done" | "Not yet";
  upload_status: "Not yet" | "Complete";
  upload_decision: "confirmed" | "declined" | null;
  decline_reason: string;
  review_status: "Processing" | "Revision(Kor)" | "R-Complete" | "Complete(Kor)";
  remark: string;
  archived: boolean;
  created_at: string;
  completed_at: string | null;
  episodes?: Episode[];
}

export interface ReworkNote {
  id: string;
  task_id: string;
  message: string;
  created_at: string;
}

export interface Task {
  id: string;
  code: string;
  project_id: string;
  category_id: string | null;
  episode_id: string | null;
  contractor_id: string;
  manager_id: string | null;
  status: TaskStatus;
  planned_start_date: string;
  start_notice_sent: boolean;
  memo: string;
  file_link: string;
  start_date: string | null;
  completed_date: string | null;
  rating: number | null;
  rework_acknowledged: boolean;
  archived: boolean;
  project?: Project;
  category?: Category;
  episode?: Episode;
  contractor?: Profile;
  manager?: Profile;
  rework_notes?: ReworkNote[];
}

// 프로젝트 상태 계산 - 비활성화(archived)된 업무는 완료 판정에서 제외합니다.
// 주의: '게재(서비스 노출)' 여부는 upload_decision 필드로 완전히 별개로 관리되며,
// 여기서 계산하는 프로젝트 상태(제작 파이프라인 단계)에는 영향을 주지 않습니다.
export function computeProjectStatus(project: Project, tasks: Task[]) {
  const list = tasks.filter((t) => t.project_id === project.id && !t.archived);
  const started = list.some((t) => t.status !== "waiting");
  const allDone = list.length > 0 && list.every((t) => t.status === "done");
  if (project.upload_status === "Complete") return "업로드 완료";
  if (allDone && project.review_status === "Complete(Kor)") return "확인 완료";
  if (allDone) return "검수 중";
  if (started) return "작업 중";
  return "준비 중";
}

export function allTasksDone(project: Project, tasks: Task[]) {
  const list = tasks.filter((t) => t.project_id === project.id && !t.archived);
  return list.length > 0 && list.every((t) => t.status === "done");
}

export function ddayLabel(project: Project) {
  const end = project.completed_at ? new Date(project.completed_at) : new Date();
  const start = new Date(project.created_at);
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  return `D+${days}`;
}

// 작업 시작~완료까지 걸린 시간을 "N시간 M분" 형식으로 계산합니다.
export function workDuration(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return null;
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}시간 ${minutes}분`;
}

// 평균 작업 시간(분 단위)을 "N시간 M분" 형식으로 표시합니다.
export function avgDurationLabel(avgMinutes: number | null) {
  if (avgMinutes == null) return "-";
  const hours = Math.floor(avgMinutes / 60);
  const minutes = Math.round(avgMinutes % 60);
  return `${hours}시간 ${minutes}분`;
}
