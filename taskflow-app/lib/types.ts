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
  ai_credit_alert_opt_in: boolean;
}

export interface MajorCategory {
  id: string;
  label: string;
  sort_order: number;
}

export interface Category {
  id: string;
  label: string;
  sort_order: number;
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
  volume_check: "Not yet" | "Complete";
  upload_status: "Not yet" | "Complete";
  upload_decision: "confirmed" | "declined" | null;
  decline_reason: string;
  review_status: "Not yet" | "Revision" | "Complete";
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

export interface AiService {
  id: string;
  label: string;
}

export interface ContractorAiAccount {
  id: string;
  contractor_id: string;
  ai_service_id: string;
  account_label: string;
  remaining_credit: number;
  updated_at: string;
  ai_service?: AiService;
}

export interface TaskAssignment {
  id: string;
  task_id: string;
  contractor_id: string;
  started_at: string | null;
  ended_at: string | null;
  file_link: string;
  rating: number | null;
  handoff_reason: string;
  is_rework: boolean;
  ai_account_id: string | null;
  credit_used: number | null;
  created_at: string;
  contractor?: Profile;
  ai_account?: ContractorAiAccount;
}

export interface SubManager {
  id: string;
  task_id: string;
  manager_id: string;
  acknowledged: boolean;
  comment: string;
  created_at: string;
  manager?: Profile;
}

export interface Task {
  id: string;
  code: string;
  project_id: string;
  category_id: string | null;
  episode_id: string | null;
  contractor_id: string; // 현재(최신) 구간 담당 외주 작업자
  manager_id: string | null; // 메인 담당자
  status: TaskStatus;
  planned_start_date: string;
  start_notice_sent: boolean;
  memo: string;
  rework_acknowledged: boolean;
  reopen_count: number;
  order_unlock_notified: boolean;
  archived: boolean;
  project?: Project;
  category?: Category;
  episode?: Episode;
  contractor?: Profile;
  manager?: Profile;
  rework_notes?: ReworkNote[];
  assignments?: TaskAssignment[];
  sub_managers?: SubManager[];
}

// 업무의 현재(최신) 배정 구간을 가져옵니다 (created_at 기준 가장 마지막 구간).
export function currentAssignment(task: Task): TaskAssignment | null {
  if (!task.assignments || task.assignments.length === 0) return null;
  return [...task.assignments].sort((a, b) => a.created_at.localeCompare(b.created_at))[task.assignments.length - 1];
}

// 프로젝트 상태 계산 - 비활성화(archived)된 업무는 완료 판정에서 제외합니다.
// 주의: '게재(서비스 노출)' 여부는 upload_decision 필드로 완전히 별개로 관리되며,
// 여기서 계산하는 프로젝트 상태(제작 파이프라인 단계)에는 영향을 주지 않습니다.
export function computeProjectStatus(project: Project, tasks: Task[]) {
  const list = tasks.filter((t) => t.project_id === project.id && !t.archived);
  const started = list.some((t) => t.status !== "waiting");
  const allDone = list.length > 0 && list.every((t) => t.status === "done");
  if (project.upload_status === "Complete") return "업로드 완료";
  if (allDone && project.review_status === "Complete") return "확인 완료";
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

// 카테고리 순서상 이 업무를 시작할 수 있는지 확인합니다.
// 같은 프로젝트+에피소드 안에서, 이 업무의 카테고리보다 순서(sort_order)가 앞선 카테고리의
// 업무가 하나라도 있다면 그 업무들이 전부 완료(done)여야 시작할 수 있습니다.
// 에피소드가 지정되지 않은 업무는 순서 제한 없이 항상 시작 가능합니다.
export function canStartTask(task: Task, allTasks: Task[], categories: Category[]): boolean {
  if (!task.episode_id || !task.category_id) return true;
  const myCat = categories.find((c) => c.id === task.category_id);
  if (!myCat) return true;
  const siblings = allTasks.filter(
    (t) => t.project_id === task.project_id && t.episode_id === task.episode_id && !t.archived && t.id !== task.id
  );
  const blockers = siblings.filter((t) => {
    const cat = categories.find((c) => c.id === t.category_id);
    return cat && cat.sort_order < myCat.sort_order;
  });
  return blockers.every((t) => t.status === "done");
}

// 이 업무보다 앞 순서(같은 에피소드) 업무가 재작업 등으로 미완료 상태로 돌아갔는데,
// 이 업무는 이미 시작되어 있는 경우를 감지해 경고 배지를 띄웁니다 (자동 중단은 하지 않음).
export function hasOutOfOrderWarning(task: Task, allTasks: Task[], categories: Category[]): boolean {
  if (!task.episode_id || !task.category_id) return false;
  if (task.status === "waiting") return false;
  const myCat = categories.find((c) => c.id === task.category_id);
  if (!myCat) return false;
  const siblings = allTasks.filter(
    (t) => t.project_id === task.project_id && t.episode_id === task.episode_id && !t.archived && t.id !== task.id
  );
  const blockers = siblings.filter((t) => {
    const cat = categories.find((c) => c.id === t.category_id);
    return cat && cat.sort_order < myCat.sort_order;
  });
  return blockers.some((t) => t.status !== "done");
}
