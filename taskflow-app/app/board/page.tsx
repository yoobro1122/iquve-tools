"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import Header from "@/app/components/Header";
import { Lang, useLang, t as tr, taskCountLabel } from "@/lib/i18n";
import {
  Play, Check, X, Plus, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  FolderPlus, Volume2, UploadCloud, ClipboardCheck, Pencil, Trash2,
  Boxes, Settings, RotateCcw, ClipboardList, Loader2, Link as LinkIcon,
  Search, Download, XCircle, Bell, Star, ArrowRightLeft, CalendarDays, Sparkles,
} from "lucide-react";
import {
  Profile, MajorCategory, Category, Project, Task,
  TASK_STATUS_LABEL, computeProjectStatus, allTasksDone, ddayLabel, workDuration, currentAssignment, canStartTask, hasOutOfOrderWarning,
} from "@/lib/types";

const PROJECT_STATUS_COLOR: Record<string, string> = {
  "준비 중": "bg-gray-100 text-gray-600",
  "작업 중": "bg-blue-50 text-blue-700",
  "검수 중": "bg-amber-50 text-amber-700",
  "확인 완료": "bg-violet-50 text-violet-700",
  "업로드 완료": "bg-emerald-50 text-emerald-700",
  "업로드 보류": "bg-red-50 text-red-700",
};
const TASK_STATUS_COLOR: Record<string, string> = {
  waiting: "text-gray-400", in_progress: "text-blue-600", reviewing: "text-amber-700",
  rework_notice: "text-red-600", done: "text-emerald-700",
};

function fmtDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}
function fmtDateTime(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function nowLocalDateTimeStr() {
  const d = new Date();
  return `${todayStr()}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function mondayOf(d: Date) {
  const day = d.getDay() === 0 ? 7 : d.getDay();
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (day - 1));
  monday.setHours(0, 0, 0, 0);
  return monday;
}
function isThisWeek(iso: string | null) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  const day = now.getDay() === 0 ? 7 : now.getDay(); // 월=1 ... 일=7
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (day - 1));
  monday.setHours(0, 0, 0, 0);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  return d >= monday && d < nextMonday;
}
function toggleSort(setSort: (fn: (s: { col: string; dir: 1 | -1 }) => { col: string; dir: 1 | -1 }) => void, col: string) {
  setSort((s) => (s.col === col ? { col, dir: s.dir === 1 ? -1 : 1 } : { col, dir: 1 }));
}
function SortHeader({ label, col, sort, onClick }: { label: string; col: string; sort: { col: string; dir: 1 | -1 }; onClick: (col: string) => void }) {
  return (
    <button onClick={() => onClick(col)} className="flex items-center gap-0.5 text-left hover:text-[#1F1E1B]">
      {label}
      {sort.col === col && (sort.dir === 1 ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
    </button>
  );
}
function projectStatusLabel(korLabel: string, lang: Lang) {
  const map: Record<string, string> = {
    "준비 중": "project_status_ready",
    "작업 중": "project_status_active",
    "검수 중": "project_status_reviewing",
    "확인 완료": "project_status_confirmed",
    "업로드 완료": "project_status_uploaded",
  };
  const key = map[korLabel];
  return key ? tr(lang, key as any) : korLabel;
}
function statusPillStyle(value: string) {
  if (value === "Not yet") return "bg-gray-100 text-gray-600";
  if (value === "Revision") return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-emerald-700"; // Complete
}
function simplifiedStatus(full: string) {
  if (full === "준비 중") return "준비 중";
  if (full === "업로드 완료") return "완료";
  if (full === "검수 중" || full === "확인 완료") return "검수 중";
  return "진행 중";
}

export default function BoardPage() {
  const supabase = createClient();
  const [lang, setLang] = useLang();
  const [me, setMe] = useState<Profile | null>(null);
  const [majorCategories, setMajorCategories] = useState<MajorCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [contractors, setContractors] = useState<Profile[]>([]);
  const [managers, setManagers] = useState<Profile[]>([]);
  const [pastAssignments, setPastAssignments] = useState<any[]>([]);
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);
  const [showPastAssignments, setShowPastAssignments] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  const [majorCategoryId, setMajorCategoryId] = useState<string>("ALL_MC");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [openBuckets, setOpenBuckets] = useState<Record<string, boolean>>({ ready: true, inprogress: true, done: true, archived: false });
  const [selectedProjectId, setSelectedProjectId] = useState<string>("ALL");
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>("ALL");
  const [viewMode, setViewMode] = useState<"category" | "status">("category");
  const [contractorShowAll, setContractorShowAll] = useState(false);
  const [projectStatusView, setProjectStatusView] = useState(false);
  const [scheduleView, setScheduleView] = useState(false);
  const [expandedContractorRows, setExpandedContractorRows] = useState<Record<string, boolean>>({});
  const [showEpisodeMatrix, setShowEpisodeMatrix] = useState(true);
  const [scheduleWeekStart, setScheduleWeekStart] = useState(() => mondayOf(new Date()));
  const [scheduleAiModal, setScheduleAiModal] = useState<{ id: string; name: string } | null>(null);
  const [scheduleAiAccounts, setScheduleAiAccounts] = useState<any[]>([]);
  const [scheduleAiLoading, setScheduleAiLoading] = useState(false);
  const [scheduleGroupOpen, setScheduleGroupOpen] = useState<Record<string, boolean>>({});
  const [scheduleTaskModal, setScheduleTaskModal] = useState<Task | null>(null);
  const [projectSort, setProjectSort] = useState<{ col: string; dir: 1 | -1 }>({ col: "name", dir: 1 });
  const [segmentSort, setSegmentSort] = useState<Record<string, { col: string; dir: 1 | -1 }>>({});
  const [showArchivedTasks, setShowArchivedTasks] = useState(false);
  const [expandedStatusRows, setExpandedStatusRows] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");

  const [showMcManage, setShowMcManage] = useState(false);
  const [newMcLabel, setNewMcLabel] = useState("");

  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectDraft, setNewProjectDraft] = useState({ code: "", name: "", major_category_id: "" });
  const [projectFormError, setProjectFormError] = useState("");

  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [editProjectDraft, setEditProjectDraft] = useState({ code: "", name: "" });
  const [editProjectError, setEditProjectError] = useState("");

  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState({ volume_check: "", upload_status: "", review_status: "" });
  const [projectLogs, setProjectLogs] = useState<any[]>([]);
  const [declineModalOpen, setDeclineModalOpen] = useState(false);
  const [declineReasonDraft, setDeclineReasonDraft] = useState("");
  const [remarkModalProjectId, setRemarkModalProjectId] = useState<string | null>(null);
  const [remarkDraft, setRemarkDraft] = useState("");
  const [viewDeclineProjectId, setViewDeclineProjectId] = useState<string | null>(null);

  const [showEpisodeManage, setShowEpisodeManage] = useState(false);
  const [newEpLabel, setNewEpLabel] = useState("");

  const [showNewTask, setShowNewTask] = useState(false);
  const [newTask, setNewTask] = useState({ category_id: "", episode_id: "", contractor_id: "", manager_id: "", planned_start_date: nowLocalDateTimeStr(), memo: "", sub_manager_ids: [] as string[], no_order_constraint: false });
  const [newTaskIsInternal, setNewTaskIsInternal] = useState(false);

  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [editTaskDraft, setEditTaskDraft] = useState({ category_id: "", episode_id: "", manager_id: "", memo: "", sub_manager_ids: [] as string[], contractor_id: "", planned_start_date: "" });
  const [editTaskIsInternal, setEditTaskIsInternal] = useState(false);

  const [reworkModalTaskId, setReworkModalTaskId] = useState<string | null>(null);
  const [reworkMessage, setReworkMessage] = useState("");

  const [handoffModalTaskId, setHandoffModalTaskId] = useState<string | null>(null);
  const [handoffContractorId, setHandoffContractorId] = useState("");
  const [handoffReason, setHandoffReason] = useState("");

  const [reopenModalTaskId, setReopenModalTaskId] = useState<string | null>(null);
  const [reopenMode, setReopenMode] = useState<"rework" | "handoff">("rework");
  const [reopenContractorId, setReopenContractorId] = useState("");
  const [reopenReason, setReopenReason] = useState("");

  const [forceCompleteTaskId, setForceCompleteTaskId] = useState<string | null>(null);
  const [forceCompleteReason, setForceCompleteReason] = useState("");

  const [subManagerAckTaskId, setSubManagerAckTaskId] = useState<string | null>(null);
  const [subManagerAckComment, setSubManagerAckComment] = useState("");

  const [submitModalTaskId, setSubmitModalTaskId] = useState<string | null>(null);
  const [fileLinkDraft, setFileLinkDraft] = useState("");
  const [myAiAccounts, setMyAiAccounts] = useState<any[]>([]);
  const [submitAiAccountId, setSubmitAiAccountId] = useState("");
  const [submitNewCredit, setSubmitNewCredit] = useState("");

  const [showExportPicker, setShowExportPicker] = useState(false);
  const [exportProjectId, setExportProjectId] = useState("");

  const [logDrawerOpen, setLogDrawerOpen] = useState(false);
  const [systemLogs, setSystemLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const load = useCallback(async (isInitial = false) => {
    if (!isInitial) setRefreshing(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setRefreshing(false); return; }
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    setMe(profile as Profile);

    const [mcRes, catRes, projRes, mgrRes] = await Promise.all([
      supabase.from("major_categories").select("*").order("sort_order"),
      supabase.from("categories").select("*").order("label"),
      supabase.from("projects").select("*, episodes(*)").order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").eq("role", "manager").order("name"),
    ]);
    setMajorCategories((mcRes.data as MajorCategory[]) ?? []);
    setCategories((catRes.data as Category[]) ?? []);
    setProjects((projRes.data as Project[]) ?? []);
    setManagers((mgrRes.data as Profile[]) ?? []);

    const { data: taskData } = await supabase
      .from("tasks")
      .select("*, project:project_id(*), category:category_id(*), episode:episode_id(*), contractor:contractor_id(*), manager:manager_id(*), rework_notes:task_rework_notes(*), assignments:task_assignments(*, contractor:contractor_id(*)), sub_managers:task_sub_managers(*, manager:manager_id(*))")
      .order("created_at", { ascending: true });
    setTasks((taskData as unknown as Task[]) ?? []);

    if (profile?.role === "manager") {
      const { data: cs } = await supabase.from("profiles").select("*").eq("role", "contractor").order("name");
      setContractors((cs as Profile[]) ?? []);
    } else {
      const { data: mine } = await supabase
        .from("task_assignments")
        .select("*, task:task_id(*, project:project_id(*), episode:episode_id(*), category:category_id(*))")
        .eq("contractor_id", user.id)
        .order("created_at", { ascending: false });
      setPastAssignments(((mine as any[]) ?? []).filter((a) => a.task && a.task.contractor_id !== user.id));

      const { data: aiAccts } = await supabase.from("contractor_ai_accounts").select("*, ai_service:ai_service_id(*)").eq("contractor_id", user.id);
      setMyAiAccounts(aiAccts ?? []);
    }

    setLoading(false);
    setRefreshing(false);
  }, [supabase]);

  useEffect(() => { load(true); }, [load]);

  async function submitPasswordChange() {
    setPwError("");
    if (newPassword.length < 8) { setPwError("비밀번호는 8자 이상이어야 합니다."); return; }
    if (newPassword !== confirmPassword) { setPwError("입력한 비밀번호가 서로 다릅니다. 다시 확인해주세요."); return; }
    setPwSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) { setPwError(error.message); return; }
      const res = await fetch("/api/me/complete-password-setup", { method: "POST" });
      if (!res.ok) { setPwError("비밀번호는 변경되었지만 상태 갱신에 실패했습니다. 새로고침 해주세요."); return; }
      setMe((m) => (m ? { ...m, must_change_password: false } : m));
      setNewPassword("");
      setConfirmPassword("");
    } finally {
      setPwSaving(false);
    }
  }

  async function api(url: string, method: string, body?: any) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(data.error ?? "오류가 발생했습니다."); return null; }
      return data;
    } finally {
      setBusy(false);
    }
  }

  const isAllMc = majorCategoryId === "ALL_MC";
  const scopedProjects = useMemo(
    () => (isAllMc ? projects : projects.filter((p) => p.major_category_id === majorCategoryId)),
    [projects, majorCategoryId, isAllMc]
  );
  const isAllView = selectedProjectId === "ALL";
  const selectedProject = !isAllView ? projects.find((p) => p.id === selectedProjectId) ?? null : null;

  const rawScopeTasks = useMemo(() => {
    let list: Task[];
    if (isAllView) {
      const ids = new Set(scopedProjects.map((p) => p.id));
      list = tasks.filter((t) => ids.has(t.project_id));
    } else if (selectedProject) {
      list = tasks.filter((t) => t.project_id === selectedProject.id);
    } else list = [];
    return list.filter((t) => !t.archived);
  }, [isAllView, scopedProjects, tasks, selectedProject]);

  const archivedTasksInScope = useMemo(() => {
    let list: Task[];
    if (isAllView) {
      const ids = new Set(scopedProjects.map((p) => p.id));
      list = tasks.filter((t) => ids.has(t.project_id));
    } else if (selectedProject) {
      list = tasks.filter((t) => t.project_id === selectedProject.id);
    } else list = [];
    return list.filter((t) => t.archived);
  }, [isAllView, scopedProjects, tasks, selectedProject]);

  const episodeFilteredTasks = useMemo(() => {
    if (isAllView || selectedEpisodeId === "ALL") return rawScopeTasks;
    return rawScopeTasks.filter((t) => t.episode_id === selectedEpisodeId);
  }, [rawScopeTasks, isAllView, selectedEpisodeId]);

  const visibleTasks = useMemo(() => {
    let list = episodeFilteredTasks;
    if (me?.role === "contractor" && !contractorShowAll) list = list.filter((t) => t.contractor_id === me.id && t.status !== "done");
    if (isAllView && searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((t) => t.contractor?.name?.toLowerCase().includes(q) || t.manager?.name?.toLowerCase().includes(q));
    }
    return list;
  }, [episodeFilteredTasks, me, isAllView, searchQuery, contractorShowAll]);

  // 외주 작업자 전용: 본인이 완료한 업무 (별도 "완료된 업무" 섹션에 표시)
  const myCompletedTasks = useMemo(() => {
    if (me?.role !== "contractor") return [];
    return episodeFilteredTasks.filter((t) => t.contractor_id === me.id && t.status === "done");
  }, [episodeFilteredTasks, me]);

  // 카테고리가 수정/삭제되어 목록이 바뀌면, 이미 열려있는 모달의 선택값이 더 이상
  // 존재하지 않는 카테고리를 가리키고 있을 수 있어 자동으로 교정합니다.
  useEffect(() => {
    if (categories.length === 0) return;
    const validIds = new Set(categories.map((c) => c.id));
    if (showNewTask && !validIds.has(newTask.category_id)) {
      setNewTask((n) => ({ ...n, category_id: categories[0].id }));
    }
    if (editTaskId && !validIds.has(editTaskDraft.category_id)) {
      setEditTaskDraft((d) => ({ ...d, category_id: categories[0].id }));
    }
  }, [categories, showNewTask, editTaskId]);

  const grouped = useMemo(() => {
    if (viewMode === "status") {
      return {
        waiting: visibleTasks.filter((t) => t.status === "waiting"),
        active: visibleTasks.filter((t) => ["in_progress", "reviewing", "rework_notice"].includes(t.status)),
        done: visibleTasks.filter((t) => t.status === "done"),
      } as Record<string, Task[]>;
    }
    const byCat: Record<string, Task[]> = {};
    categories.forEach((c) => { byCat[c.id] = visibleTasks.filter((t) => t.category_id === c.id); });
    byCat["UNASSIGNED"] = visibleTasks.filter((t) => !t.category_id);
    return byCat;
  }, [visibleTasks, viewMode, categories]);

  const buckets = useMemo(() => {
    const b: Record<string, Project[]> = { ready: [], inprogress: [], done: [], archived: [] };
    scopedProjects.forEach((p) => {
      if (p.archived) b.archived.push(p);
      else {
        const s = computeProjectStatus(p, tasks);
        if (s === "준비 중") b.ready.push(p);
        else if (s === "업로드 완료") b.done.push(p);
        else b.inprogress.push(p);
      }
    });
    return b;
  }, [scopedProjects, tasks]);

  const sortedStatusProjects = useMemo(() => {
    const withMeta = scopedProjects.map((p) => {
      const projTasks = tasks.filter((t) => t.project_id === p.id && !t.archived);
      const allSegs = projTasks.flatMap((t) => t.assignments ?? []);
      const started = allSegs.filter((a) => a.started_at).map((a) => a.started_at!).sort()[0] ?? null;
      const simple = simplifiedStatus(computeProjectStatus(p, tasks));
      return { p, started, simple };
    });
    const val = (row: (typeof withMeta)[number]): string => {
      switch (projectSort.col) {
        case "status": return row.simple;
        case "created": return row.p.created_at ?? "";
        case "started": return row.started ?? "";
        case "completed": return row.p.completed_at ?? "";
        case "publish": return row.p.upload_decision ?? "";
        case "remark": return row.p.remark ?? "";
        default: return row.p.name ?? "";
      }
    };
    return [...withMeta].sort((a, b) => val(a).localeCompare(val(b)) * projectSort.dir);
  }, [scopedProjects, tasks, projectSort]);

  // ---------------- task actions ----------------
  async function taskStart(t: Task) { if (await api(`/api/tasks/${t.id}/start`, "POST")) load(); }
  function openSubmitModal(t: Task) { setSubmitModalTaskId(t.id); setFileLinkDraft(currentAssignment(t)?.file_link || ""); setSubmitAiAccountId(""); setSubmitNewCredit(""); }
  async function confirmSubmit() {
    if (!fileLinkDraft.trim()) { alert("작업 파일 링크를 입력해주세요."); return; }
    const body: any = { file_link: fileLinkDraft.trim() };
    if (submitAiAccountId) {
      if (submitNewCredit === "" || isNaN(Number(submitNewCredit))) { alert("사용한 AI 서비스의 남은 크레딧을 입력해주세요."); return; }
      body.ai_account_id = submitAiAccountId;
      body.new_remaining_credit = Number(submitNewCredit);
    }
    if (await api(`/api/tasks/${submitModalTaskId}/submit`, "POST", body)) {
      setSubmitModalTaskId(null);
      load();
    }
  }
  async function acknowledgeMessage(t: Task) { if (await api(`/api/tasks/${t.id}/acknowledge`, "POST")) load(); }
  async function reviewApprove(t: Task) { if (await api(`/api/tasks/${t.id}/review`, "POST", { result: "pass" })) load(); }
  function openReworkModal(t: Task) { setReworkModalTaskId(t.id); setReworkMessage(""); }
  async function submitRework() {
    const t = tasks.find((x) => x.id === reworkModalTaskId);
    if (!t) return;
    const url = t.status === "reviewing" ? `/api/tasks/${t.id}/review` : `/api/tasks/${t.id}/rework-edit`;
    const body = t.status === "reviewing" ? { result: "reject", note: reworkMessage } : { message: reworkMessage };
    if (await api(url, "POST", body)) { setReworkModalTaskId(null); load(); }
  }

  function openHandoffModal(t: Task) {
    setHandoffModalTaskId(t.id);
    setHandoffContractorId("");
    setHandoffReason("");
  }
  async function submitHandoff() {
    if (!handoffContractorId) { alert("인계할 작업자를 선택해주세요."); return; }
    if (!handoffReason.trim()) { alert("인계 사유를 입력해주세요."); return; }
    if (await api(`/api/tasks/${handoffModalTaskId}/review`, "POST", { result: "handoff", new_contractor_id: handoffContractorId, note: handoffReason.trim() })) {
      setHandoffModalTaskId(null);
      load();
    }
  }

  function openReopenModal(t: Task) {
    setReopenModalTaskId(t.id);
    setReopenMode("rework");
    setReopenContractorId("");
    setReopenReason("");
  }
  async function submitReopen() {
    if (!reopenReason.trim()) { alert("재작업/인계 사유를 입력해주세요."); return; }
    if (reopenMode === "handoff" && !reopenContractorId) { alert("인계할 작업자를 선택해주세요."); return; }
    const body: any = { mode: reopenMode, reason: reopenReason.trim() };
    if (reopenMode === "handoff") body.new_contractor_id = reopenContractorId;
    if (await api(`/api/tasks/${reopenModalTaskId}/reopen`, "POST", body)) {
      setReopenModalTaskId(null);
      load();
    }
  }

  function openForceComplete(t: Task) { setForceCompleteTaskId(t.id); setForceCompleteReason(""); }
  async function submitForceComplete() {
    if (!forceCompleteReason.trim()) { alert("완료 처리 사유를 입력해주세요."); return; }
    if (await api(`/api/tasks/${forceCompleteTaskId}/force-complete`, "POST", { reason: forceCompleteReason.trim() })) {
      setForceCompleteTaskId(null);
      load();
    }
  }

  function openSubManagerAck(t: Task) {
    const mine = (t.sub_managers ?? []).find((s) => s.manager_id === me?.id);
    setSubManagerAckTaskId(t.id);
    setSubManagerAckComment(mine?.comment ?? "");
  }
  async function submitSubManagerAck() {
    if (await api(`/api/tasks/${subManagerAckTaskId}/sub-manager-ack`, "POST", { comment: subManagerAckComment })) {
      setSubManagerAckTaskId(null);
      load();
    }
  }

  async function openScheduleAiModal(c: { id: string; name: string }) {
    setScheduleAiModal(c);
    setScheduleAiLoading(true);
    const res = await fetch(`/api/contractors/${c.id}/ai-accounts`);
    const data = await res.json();
    setScheduleAiAccounts(data.items ?? []);
    setScheduleAiLoading(false);
  }

  function jumpToTask(t: Task) {
    setMajorCategoryId(t.project!.major_category_id);
    setSelectedProjectId(t.project_id);
    setSelectedEpisodeId(t.episode_id ?? "ALL");
    setScheduleView(false);
    setProjectStatusView(false);
  }

  async function rateAssignment(assignmentId: string, rating: number) {
    if (await api(`/api/task-assignments/${assignmentId}`, "PATCH", { rating })) load();
  }

  function openEditTask(t: Task) {
    setEditTaskId(t.id);
    const d = new Date(t.planned_start_date);
    const localStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    setEditTaskIsInternal(managers.some((m) => m.id === t.contractor_id));
    setEditTaskDraft({
      category_id: t.category_id ?? "", episode_id: t.episode_id ?? "", manager_id: t.manager_id ?? "", memo: t.memo ?? "",
      sub_manager_ids: (t.sub_managers ?? []).map((s) => s.manager_id),
      contractor_id: t.contractor_id, planned_start_date: localStr,
    });
  }
  async function saveEditTask() {
    if (!categories.some((c) => c.id === editTaskDraft.category_id)) {
      alert("카테고리를 선택해주세요.");
      return;
    }
    if (editTaskDraft.manager_id && !managers.some((m) => m.id === editTaskDraft.manager_id)) {
      alert("담당자를 선택해주세요.");
      return;
    }
    const t = tasks.find((x) => x.id === editTaskId);
    if (t && t.status === "waiting") {
      const workerList = editTaskIsInternal ? managers : contractors;
      if (!workerList.some((c) => c.id === editTaskDraft.contractor_id)) {
        alert(editTaskIsInternal ? "내부 진행자를 선택해주세요." : "외주 작업자를 선택해주세요.");
        return;
      }
    }
    const body: any = { ...editTaskDraft };
    if (t && t.status !== "waiting") {
      // 이미 시작된 업무는 작업자/등록일을 바꿀 수 없으므로 아예 보내지 않음 (변경 안 함)
      delete body.contractor_id;
      delete body.planned_start_date;
    } else if (body.planned_start_date) {
      body.planned_start_date = new Date(body.planned_start_date).toISOString();
    }
    if (await api(`/api/tasks/${editTaskId}`, "PATCH", body)) { setEditTaskId(null); load(); }
  }
  async function archiveTaskFromModal() {
    if (!confirm("이 업무를 삭제(비활성화) 처리할까요? 나중에 복원할 수 있습니다.")) return;
    if (await api(`/api/tasks/${editTaskId}`, "PATCH", { archived: true })) { setEditTaskId(null); load(); }
  }
  async function restoreTask(t: Task) { if (await api(`/api/tasks/${t.id}`, "PATCH", { archived: false })) load(); }
  async function permanentlyDeleteTask(t: Task) {
    if (!confirm(`업무 ${t.code}를 DB에서 완전히 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
    if (await api(`/api/tasks/${t.id}`, "DELETE")) load();
  }

  async function createTask() {
    if (!categories.some((c) => c.id === newTask.category_id)) {
      alert("카테고리를 선택해주세요.");
      return;
    }
    const workerList = newTaskIsInternal ? managers : contractors;
    if (!workerList.some((c) => c.id === newTask.contractor_id)) {
      alert(newTaskIsInternal ? "내부 진행자를 선택해주세요." : "외주 작업자를 선택해주세요.");
      return;
    }
    if (newTask.manager_id && !managers.some((m) => m.id === newTask.manager_id)) {
      alert("담당자를 선택해주세요.");
      return;
    }
    if (await api("/api/tasks", "POST", { project_id: selectedProject!.id, ...newTask, planned_start_date: new Date(newTask.planned_start_date).toISOString() })) { setShowNewTask(false); load(); }
  }

  async function addCategory() {
    if (!newCatLabel.trim()) return;
    const data = await api("/api/categories", "POST", { label: newCatLabel.trim() });
    if (data) { setNewTask((n) => ({ ...n, category_id: data.item.id })); setNewCatLabel(""); load(); }
  }
  async function renameCategory(id: string, current: string) {
    const label = prompt("카테고리 이름 수정", current);
    if (!label) return;
    if (await api(`/api/categories/${id}`, "PATCH", { label })) load();
  }
  async function deleteCategory(id: string) {
    if (!confirm("이 카테고리를 삭제할까요?")) return;
    if (await api(`/api/categories/${id}`, "DELETE")) load();
  }
  async function moveCategory(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;
    const a = categories[index];
    const b = categories[target];
    setBusy(true);
    try {
      await Promise.all([
        fetch(`/api/categories/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sort_order: b.sort_order }) }),
        fetch(`/api/categories/${b.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sort_order: a.sort_order }) }),
      ]);
    } finally {
      setBusy(false);
    }
    load();
  }
  const [newCatLabel, setNewCatLabel] = useState("");

  async function addEpisode() {
    if (!newEpLabel.trim() || !selectedProject) return;
    if (await api(`/api/projects/${selectedProject.id}/episodes`, "POST", { label: newEpLabel.trim() })) { setNewEpLabel(""); load(); }
  }
  async function renameEpisode(id: string, current: string) {
    const label = prompt("에피소드 이름 수정", current);
    if (!label) return;
    if (await api(`/api/episodes/${id}`, "PATCH", { label })) load();
  }
  async function deleteEpisode(id: string) {
    if (!confirm("이 에피소드를 삭제할까요? (해당 에피소드가 지정된 업무는 '적용 안함'으로 바뀝니다)")) return;
    if (await api(`/api/episodes/${id}`, "DELETE")) { if (selectedEpisodeId === id) setSelectedEpisodeId("ALL"); load(); }
  }

  async function addMajorCategory() {
    if (!newMcLabel.trim()) return;
    if (await api("/api/major-categories", "POST", { label: newMcLabel.trim() })) { setNewMcLabel(""); load(); }
  }
  async function renameMajorCategory(id: string, current: string) {
    const label = prompt("대분류 이름 수정", current);
    if (!label) return;
    if (await api(`/api/major-categories/${id}`, "PATCH", { label })) load();
  }
  async function deleteMajorCategory(id: string) {
    if (!confirm("이 대분류를 삭제할까요?")) return;
    if (await api(`/api/major-categories/${id}`, "DELETE")) { if (majorCategoryId === id) setMajorCategoryId("ALL_MC"); load(); }
  }

  function openEditProject() {
    if (!selectedProject) return;
    setEditProjectDraft({ code: selectedProject.code, name: selectedProject.name });
    setEditProjectError("");
    setEditProjectOpen(true);
  }
  async function saveEditProject() {
    const data = await api(`/api/projects/${selectedProject!.id}`, "PATCH", editProjectDraft);
    if (!data) return;
    setEditProjectOpen(false);
    load();
  }
  async function deleteProjectFromModal() {
    if (!confirm("이 프로젝트를 삭제(비활성화) 처리할까요? 나중에 복원할 수 있습니다.")) return;
    if (await api(`/api/projects/${selectedProject!.id}`, "PATCH", { archived: true })) {
      setEditProjectOpen(false);
      setSelectedProjectId("ALL");
      load();
    }
  }
  async function restoreProject(p: Project) { if (await api(`/api/projects/${p.id}`, "PATCH", { archived: false })) load(); }
  async function permanentlyDeleteProject(p: Project) {
    if (!confirm(`프로젝트 "${p.name}"를 DB에서 완전히 삭제할까요? 하위 업무/에피소드도 모두 함께 삭제되며, 이 작업은 되돌릴 수 없습니다.`)) return;
    if (await api(`/api/projects/${p.id}`, "DELETE")) { if (selectedProjectId === p.id) setSelectedProjectId("ALL"); load(); }
  }

  function openNewProjectModal() {
    setNewProjectDraft({ code: "", name: "", major_category_id: isAllMc ? "" : majorCategoryId });
    setProjectFormError("");
    setShowNewProject(true);
  }
  async function submitNewProject() {
    if (!newProjectDraft.major_category_id) { setProjectFormError("대분류를 선택해주세요."); return; }
    const data = await api("/api/projects", "POST", newProjectDraft);
    if (!data) return;
    setMajorCategoryId(newProjectDraft.major_category_id);
    setSelectedProjectId(data.item.id);
    setShowNewProject(false);
    load();
  }

  async function openLogDrawer() {
    setLogDrawerOpen(true);
    setLogsLoading(true);
    const { data } = await supabase
      .from("project_logs")
      .select("*, project:project_id(name, code)")
      .order("created_at", { ascending: false })
      .limit(300);
    setSystemLogs(data ?? []);
    setLogsLoading(false);
  }

  async function openStatusModal() {
    if (!selectedProject) return;
    setDraftStatus({ volume_check: selectedProject.volume_check, upload_status: selectedProject.upload_status, review_status: selectedProject.review_status });
    const { data } = await supabase.from("project_logs").select("*").eq("project_id", selectedProject.id).order("created_at", { ascending: false });
    setProjectLogs(data ?? []);
    setStatusModalOpen(true);
  }
  async function saveStatus() {
    if (await api(`/api/projects/${selectedProject!.id}/status`, "PATCH", draftStatus)) { setStatusModalOpen(false); load(); }
  }
  async function handlePublishConfirm() {
    if (await api(`/api/projects/${selectedProject!.id}/publish`, "POST", { decision: "confirm" })) load();
  }
  function openDeclineModal() { setDeclineReasonDraft(""); setDeclineModalOpen(true); }
  async function submitDecline() {
    if (await api(`/api/projects/${selectedProject!.id}/publish`, "POST", { decision: "decline", reason: declineReasonDraft })) {
      setDeclineModalOpen(false);
      load();
    }
  }

  const projectDone = selectedProject ? allTasksDone(selectedProject, tasks) : false;

  function episodeLabel(t: Task) { return t.episode?.label ?? "적용 안함"; }
  function contractorName(t: Task) { return t.contractor?.name ?? "-"; }
  function managerName(t: Task) { return t.manager?.name ?? "-"; }

  if (loading || !me) return <div className="p-6 text-sm text-[#79766D]">불러오는 중...</div>;

  const inputCls = "w-full rounded-lg border border-[#E4E1D6] px-2.5 py-2 text-[13.5px]";
  const btnPrimary = "rounded-lg bg-[#1F1E1B] px-3.5 py-2 text-sm font-semibold text-white";
  const btnDefault = "rounded-lg border border-[#E4E1D6] px-3.5 py-2 text-sm";
  const btnDanger = "rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white";
  const btnSuccess = "rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white";

  function TaskCard({ t }: { t: Task }) {
    const proj = t.project!;
    const projectArchived = proj.archived;
    const isMine = t.contractor_id === me!.id;
    const isManagerView = me!.role === "manager";
    const notes = t.rework_notes ?? [];
    const cur = currentAssignment(t);
    const subs = t.sub_managers ?? [];
    const mySubRow = me!.role === "manager" ? subs.find((s) => s.manager_id === me!.id) : undefined;
    const isSubManager = !!mySubRow;
    const canStart = canStartTask(t, tasks, categories);
    const outOfOrder = hasOutOfOrderWarning(t, tasks, categories);
    const isReopened = t.reopen_count > 0 && t.status !== "done";

    return (
      <div className="rounded-xl border border-[#E4E1D6] bg-white p-3.5" style={{ opacity: projectArchived ? 0.6 : 1 }}>
        <div className="mb-1.5 flex items-start justify-between">
          <div className="text-[10.5px] text-[#A7A399]">{proj.code} / {t.code} / {proj.name}</div>
          {isManagerView && !projectArchived && t.status !== "done" && (
            <button onClick={() => openEditTask(t)} title="업무 수정"><Pencil size={12} className="text-[#79766D]" /></button>
          )}
          {isManagerView && !projectArchived && t.status === "done" && (
            <button onClick={() => openReopenModal(t)} title="완료 업무 수정 (재작업/인계)"><Pencil size={12} className="text-[#79766D]" /></button>
          )}
        </div>
        <div className="mb-1.5 text-[15px] font-bold">{episodeLabel(t)}</div>
        <div className="mb-2 text-[12.5px] text-[#79766D]">
          {contractorName(t)} <span className="text-[#A7A399]">(담당: {managerName(t)})</span> · <span className={`font-semibold ${TASK_STATUS_COLOR[t.status]}`}>{tr(lang, `task_status_${t.status}` as any)}{isReopened && " (재진행)"}</span>
        </div>

        {outOfOrder && (
          <div className="mb-2 rounded-lg bg-red-50 px-2 py-1.5 text-[11px] font-semibold text-red-700">
            ⚠️ 이전 순서 업무가 재작업 중입니다
          </div>
        )}

        {subs.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {subs.map((s) => (
              <span key={s.id} className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${s.acknowledged ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                참조: {s.manager?.name ?? "-"} {s.acknowledged ? "✓" : ""}
              </span>
            ))}
          </div>
        )}

        {t.memo && (
          <div className="mb-2 rounded-lg bg-[#F6F5F0] p-2 text-xs text-[#79766D]"><b>메모</b> {t.memo}</div>
        )}

        {cur?.file_link && (
          <a href={cur.file_link} target="_blank" rel="noreferrer" className="mb-2 flex items-center gap-1 text-xs text-[#2C56C9] underline">
            <LinkIcon size={11} /> 작업 파일 확인
          </a>
        )}

        {t.status === "rework_notice" && notes.length > 0 && (
          <div className="mb-2 flex flex-col gap-1.5">
            {notes.map((n) => (
              <div key={n.id} className="rounded-lg bg-red-50 p-2 text-xs text-red-700">
                {n.message}
                <div className="mt-1 text-[10.5px] text-[#A7A399]">{new Date(n.created_at).toLocaleString("ko-KR")}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mb-2 flex justify-between text-[11px] text-[#A7A399]">
          <span>
            {t.status === "waiting" ? `등록일 ${fmtDateTime(t.planned_start_date)}` : (cur?.started_at ? `${tr(lang, cur.is_rework ? "restart_short" : "start_short")} ${fmtDateTime(cur.started_at)}` : "\u00A0")}
          </span>
          <span>{cur?.ended_at ? `${tr(lang, cur.is_rework ? "reend_short" : "end_short")} ${fmtDateTime(cur.ended_at)}` : "\u00A0"}</span>
        </div>
        {cur?.rating && (
          <div className="mb-2 text-xs text-amber-600">★ {cur.rating}점{cur.credit_used != null && <span className="ml-2 text-[#A7A399]">크레딧 -{cur.credit_used}</span>}</div>
        )}

        {!projectArchived && isMine && t.status === "waiting" && (
          canStart ? (
            <button onClick={() => taskStart(t)} className={`${btnPrimary} flex w-full items-center justify-center gap-1.5`}><Play size={13} /> {tr(lang, "task_start")}</button>
          ) : (
            <button disabled className={`${btnDefault} flex w-full cursor-not-allowed items-center justify-center gap-1.5 opacity-50`}>이전 순서 업무 완료 대기중</button>
          )
        )}
        {!projectArchived && isMine && t.status === "in_progress" && (
          <button onClick={() => openSubmitModal(t)} className={`${btnPrimary} flex w-full items-center justify-center gap-1.5`}><Check size={13} /> {tr(lang, "task_end")}</button>
        )}
        {!projectArchived && isMine && t.status === "reviewing" && (
          <div className="text-xs text-[#A7A399]">담당자 검수를 기다리는 중입니다.</div>
        )}
        {!projectArchived && isMine && t.status === "rework_notice" && !t.rework_acknowledged && (
          <button onClick={() => acknowledgeMessage(t)} className={`${btnDanger} w-full`}>메시지 확인 완료</button>
        )}
        {!projectArchived && isMine && t.status === "rework_notice" && t.rework_acknowledged && (
          <button onClick={() => openSubmitModal(t)} className={`${btnPrimary} flex w-full items-center justify-center gap-1.5`}><Check size={13} /> 수정 완료</button>
        )}

        {!projectArchived && isManagerView && !isSubManager && t.status === "reviewing" && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => reviewApprove(t)} className={`${btnSuccess} flex items-center gap-1`}><Check size={13} /> {tr(lang, "review_approve")}</button>
            <button onClick={() => openReworkModal(t)} className={`${btnDanger} flex items-center gap-1`}><X size={13} /> {tr(lang, "rework_request")}</button>
            <button onClick={() => openHandoffModal(t)} className={`${btnDefault} flex items-center gap-1`}><ArrowRightLeft size={13} /> {tr(lang, "handoff")}</button>
          </div>
        )}
        {!projectArchived && isManagerView && !isSubManager && t.status === "rework_notice" && (
          <button onClick={() => openReworkModal(t)} className={`${btnDefault} flex items-center gap-1`}><Pencil size={13} /> 메시지 수정</button>
        )}
        {!projectArchived && isManagerView && !isSubManager && ["waiting", "in_progress"].includes(t.status) && (
          <div className="text-xs text-[#A7A399]">작업자 진행을 기다리는 중입니다.</div>
        )}
        {!projectArchived && isManagerView && !isSubManager && t.status !== "done" && (
          <button onClick={() => openForceComplete(t)} className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#E4E1D6] px-3.5 py-1.5 text-[11.5px] text-[#79766D]">
            <Check size={12} /> 담당자 완료 처리
          </button>
        )}
        {!projectArchived && isSubManager && (
          <button onClick={() => openSubManagerAck(t)} className={`${btnDefault} flex w-full items-center justify-center gap-1.5`}>
            {mySubRow?.acknowledged ? "확인 내용 수정" : "확인 + 의견 남기기"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F6F5F0] text-[#1F1E1B]">
      <Header name={me.name} role={me.role} lang={lang} onLangChange={setLang} />

      {(busy || refreshing) && (
        <div className="fixed left-1/2 top-4 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#1F1E1B] px-4 py-2 text-xs font-semibold text-white shadow-lg">
          <Loader2 size={14} className="animate-spin" /> 처리 중...
        </div>
      )}

      {me.must_change_password && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-5">
          <div className="w-[380px] rounded-2xl bg-white p-5">
            <h3 className="mb-1 text-[15.5px] font-bold">비밀번호를 설정해주세요</h3>
            <p className="mb-4 text-xs text-[#A7A399]">임시 비밀번호로 로그인하셨습니다. 계속 사용하시려면 본인만의 비밀번호로 변경해주세요.</p>
            <label className="mb-1 block text-xs text-[#79766D]">새 비밀번호 (8자 이상)</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mb-2.5 w-full rounded-lg border border-[#E4E1D6] px-2.5 py-2 text-[13.5px]" />
            <label className="mb-1 block text-xs text-[#79766D]">새 비밀번호 다시 입력</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mb-3 w-full rounded-lg border border-[#E4E1D6] px-2.5 py-2 text-[13.5px]" />
            {pwError && <div className="mb-3 text-xs text-red-600">{pwError}</div>}
            <button onClick={submitPasswordChange} disabled={pwSaving} className="w-full rounded-lg bg-[#1F1E1B] px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {pwSaving ? "저장 중..." : "비밀번호 설정하고 계속하기"}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 border-b border-[#E4E1D6] bg-white px-6">
        <button onClick={() => setMajorCategoryId("ALL_MC")} className={`px-5 py-3 text-[13.5px] font-bold ${isAllMc ? "border-b-2 border-[#2C56C9] text-[#2C56C9]" : "border-b-2 border-transparent text-[#79766D]"}`}>{tr(lang, "all_view")}</button>
        {majorCategories.map((mc) => (
          <button key={mc.id} onClick={() => setMajorCategoryId(mc.id)} className={`px-5 py-3 text-[13.5px] font-bold ${majorCategoryId === mc.id ? "border-b-2 border-[#2C56C9] text-[#2C56C9]" : "border-b-2 border-transparent text-[#79766D]"}`}>{mc.label}</button>
        ))}
        {me.role === "manager" && (
          <>
            <button onClick={openLogDrawer} className="ml-auto flex items-center gap-1.5 px-2.5 py-2 text-[12.5px] font-semibold text-[#79766D]"><Bell size={13} /> {tr(lang, "full_log")}</button>
            <button onClick={() => setShowMcManage(true)} className="flex items-center gap-1.5 px-2.5 py-2 text-[12.5px] font-semibold text-[#79766D]"><Settings size={13} /> {tr(lang, "edit")}</button>
          </>
        )}
      </div>

      <div className="flex flex-1">
        <aside className={`flex-shrink-0 overflow-y-auto border-r border-[#E4E1D6] bg-white ${sidebarOpen ? "w-60 p-4" : "w-14 p-2"}`}>
          <div className={`mb-3 flex items-center ${sidebarOpen ? "justify-between" : "justify-center"}`}>
            {sidebarOpen && <span className="text-[11.5px] font-bold uppercase tracking-wide text-[#79766D]">프로젝트</span>}
            <button onClick={() => setSidebarOpen((v) => !v)} className="flex h-6 w-6 items-center justify-center rounded-md border border-[#E4E1D6]">
              {sidebarOpen ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
            </button>
          </div>

          {sidebarOpen && me.role === "manager" && (
            <button onClick={openNewProjectModal} className="mb-3 flex w-full items-center gap-1.5 rounded-lg border border-dashed border-[#E4E1D6] px-2.5 py-1.5 text-[12.5px] font-semibold text-[#2C56C9]">
              <FolderPlus size={14} /> 새 프로젝트
            </button>
          )}

          {[
            { key: "ready", label: tr(lang, "ready_projects") },
            { key: "inprogress", label: tr(lang, "inprogress_projects") },
            { key: "done", label: tr(lang, "done_projects") },
            { key: "archived", label: tr(lang, "archived_projects") },
          ].map((bm) => (
            <div key={bm.key} className="mb-1.5">
              <button onClick={() => setOpenBuckets((o) => ({ ...o, [bm.key]: !o[bm.key] }))} className={`flex w-full items-center ${sidebarOpen ? "justify-between" : "justify-center"} px-1 py-1.5 text-[11.5px] font-bold text-[#79766D]`}>
                {sidebarOpen ? <span>{bm.label} · {buckets[bm.key].length}</span> : <span>{buckets[bm.key].length}</span>}
                {sidebarOpen && <ChevronDown size={13} style={{ transform: openBuckets[bm.key] ? "rotate(0deg)" : "rotate(-90deg)" }} />}
              </button>
              {openBuckets[bm.key] && buckets[bm.key].map((p) => {
                const active = selectedProjectId === p.id;
                const count = tasks.filter((t) => t.project_id === p.id && !t.archived).length;
                return sidebarOpen ? (
                  <div key={p.id} className="mb-0.5 flex items-center gap-1">
                    <button onClick={() => { setSelectedProjectId(p.id); setSelectedEpisodeId("ALL"); setProjectStatusView(false); setScheduleView(false); }} className={`min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left ${active ? "bg-[#E8EDFB]" : ""}`} style={{ opacity: p.archived ? 0.55 : 1 }}>
                      <div className={`text-[10.5px] font-bold ${active ? "text-[#2C56C9]" : "text-[#A7A399]"}`}>{p.code} / 업무 {count}건</div>
                      <div className={`truncate text-[13px] font-semibold ${active ? "text-[#2C56C9]" : ""}`}>{p.name}</div>
                    </button>
                    {p.archived && me.role === "manager" && (
                      <>
                        <button onClick={() => restoreProject(p)} title="복원" className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-[#E4E1D6]"><RotateCcw size={12} /></button>
                        <button onClick={() => permanentlyDeleteProject(p)} title="완전 삭제" className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-[#E4E1D6] text-red-600"><XCircle size={12} /></button>
                      </>
                    )}
                  </div>
                ) : (
                  <button key={p.id} onClick={() => { setSelectedProjectId(p.id); setSelectedEpisodeId("ALL"); setProjectStatusView(false); setScheduleView(false); }} title={`${p.code} · ${p.name}`} className={`mx-auto mb-1.5 flex h-9 w-9 items-center justify-center rounded-lg text-[10.5px] font-bold ${active ? "bg-[#E8EDFB] text-[#2C56C9]" : "text-[#79766D]"}`} style={{ opacity: p.archived ? 0.55 : 1 }}>
                    {p.code.slice(0, 4)}
                  </button>
                );
              })}
            </div>
          ))}

          <div className="mt-4 border-t border-[#E4E1D6] pt-3.5">
            <button onClick={() => { setSelectedProjectId("ALL"); setProjectStatusView(false); setScheduleView(false); }} className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-bold ${sidebarOpen ? "justify-start" : "justify-center"} ${isAllView && !projectStatusView && !scheduleView ? "bg-[#E8EDFB] text-[#2C56C9]" : ""}`}>
              <Boxes size={14} />{sidebarOpen && ` ${tr(lang, "all_tasks")}`}
            </button>
            {me.role === "manager" && (
              <button onClick={() => { setProjectStatusView(true); setScheduleView(false); }} className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-bold ${sidebarOpen ? "justify-start" : "justify-center"} ${projectStatusView ? "bg-[#E8EDFB] text-[#2C56C9]" : ""}`}>
                <ClipboardList size={14} />{sidebarOpen && ` ${tr(lang, "project_status")}`}
              </button>
            )}
            <button onClick={() => { setScheduleView(true); setProjectStatusView(false); }} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-bold ${sidebarOpen ? "justify-start" : "justify-center"} ${scheduleView ? "bg-[#E8EDFB] text-[#2C56C9]" : ""}`}>
              <CalendarDays size={14} />{sidebarOpen && ` ${tr(lang, "schedule")}`}
            </button>
          </div>
        </aside>

        <main className="flex-1 overflow-x-auto p-6">
          {scheduleView ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">일정 관리</h2>
                <div className="flex items-center gap-2 text-sm">
                  <button onClick={() => setScheduleWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })} className="flex h-7 w-7 items-center justify-center rounded-md border border-[#E4E1D6]"><ChevronLeft size={14} /></button>
                  <span className="font-semibold">
                    {scheduleWeekStart.getFullYear()}.{scheduleWeekStart.getMonth() + 1}.{scheduleWeekStart.getDate()} ~ {(() => { const e = new Date(scheduleWeekStart); e.setDate(e.getDate() + 6); return `${e.getMonth() + 1}.${e.getDate()}`; })()}
                  </span>
                  <button onClick={() => setScheduleWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })} className="flex h-7 w-7 items-center justify-center rounded-md border border-[#E4E1D6]"><ChevronRight size={14} /></button>
                  <button onClick={() => setScheduleWeekStart(mondayOf(new Date()))} className={btnDefault}>이번 주</button>
                </div>
              </div>
              {(() => {
                const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(scheduleWeekStart); d.setDate(d.getDate() + i); return d; });
                const toDay = (d: string | Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
                const today = toDay(new Date());
                // 업무 하나가 특정 날짜에 대기중/진행중/완료 중 어디에 해당하는지 판별
                // (등록일~시작 전날: 대기중 / 시작일~완료 전날: 진행중 / 완료일 당일만: 완료)
                const taskDayBucket = (t: Task, day: Date): "waiting" | "active" | "done" | null => {
                  const cur = currentAssignment(t);
                  const dayD = toDay(day);
                  const regD = toDay(t.planned_start_date);
                  const startD = cur?.started_at ? toDay(cur.started_at) : null;
                  const endD = cur?.ended_at ? toDay(cur.ended_at) : null;
                  if (endD && dayD.getTime() === endD.getTime()) return "done";
                  if (endD && dayD > endD) return null;
                  if (startD && dayD >= startD) return "active";
                  if (dayD.getTime() === regD.getTime()) return "waiting";
                  return null;
                };
                const scopedProjectIds = new Set(scopedProjects.map((p) => p.id));
                const scopedTasks = tasks.filter((t) => scopedProjectIds.has(t.project_id) && !t.archived);
                const byContractor: Record<string, Task[]> = {};
                scopedTasks.forEach((t) => { (byContractor[t.contractor_id] ??= []).push(t); });
                const allContractorIds = contractors.map((c) => c.id);
                return allContractorIds.map((cid) => {
                  const cName = contractors.find((c) => c.id === cid)?.name ?? scopedTasks.find((t) => t.contractor_id === cid)?.contractor?.name ?? "알 수 없음";
                  const list = byContractor[cid] ?? [];
                  const todayBuckets = list.map((t) => taskDayBucket(t, today));
                  const waitingTodayCount = todayBuckets.filter((b) => b === "waiting").length;
                  const activeTodayCount = todayBuckets.filter((b) => b === "active").length;
                  const doneTodayCount = todayBuckets.filter((b) => b === "done").length;
                  const expanded = expandedContractorRows[cid] !== false;
                  return (
                    <div key={cid} className="mb-3 overflow-hidden rounded-xl border border-[#E4E1D6] bg-white">
                      <div className="flex items-center gap-2 px-4 py-3">
                        <button onClick={() => setExpandedContractorRows((s) => ({ ...s, [cid]: !s[cid] }))} className="flex flex-1 items-center gap-2 text-left">
                          <ChevronDown size={14} style={{ transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }} className="flex-shrink-0 text-[#A7A399]" />
                          <span className="text-[14px] font-bold">{cName}</span>
                          <span className="text-[12px] text-[#A7A399]">대기 {waitingTodayCount} · 진행 {activeTodayCount} · 완료 {doneTodayCount} <span className="text-[#D9D6CC]">(금일 기준)</span></span>
                        </button>
                        {me.role === "manager" && (
                          <button onClick={() => openScheduleAiModal({ id: cid, name: cName })} className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-[#E4E1D6] px-2.5 py-1.5 text-[11.5px] text-[#79766D]">
                            <Sparkles size={12} /> AI 서비스 계정
                          </button>
                        )}
                      </div>
                      {expanded && (
                        <div className="grid grid-cols-7 gap-2 border-t border-[#E4E1D6] p-3">
                          {weekDays.map((day, dayIdx) => {
                            const waitingToday = list.filter((t) => taskDayBucket(t, day) === "waiting");
                            const activeToday = list.filter((t) => taskDayBucket(t, day) === "active");
                            const doneToday = list.filter((t) => taskDayBucket(t, day) === "done");
                            const isToday = toDay(day).getTime() === today.getTime();
                            const groups = [
                              { key: "waiting", label: tr(lang, "label_pending"), items: waitingToday, cls: "bg-gray-100 text-gray-600 hover:bg-gray-200" },
                              { key: "active", label: tr(lang, "label_working_short"), items: activeToday, cls: "bg-blue-50 text-blue-700 hover:bg-blue-100" },
                              { key: "done", label: tr(lang, "label_complete"), items: doneToday, cls: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
                            ];
                            return (
                              <div key={day.toISOString()} className={`min-h-[84px] rounded-lg p-2 ${isToday ? "bg-[#E8EDFB]" : "bg-[#FAFAF7]"}`}>
                                <div className="mb-1.5 text-[11px] font-bold text-[#79766D]">{["월", "화", "수", "목", "금", "토", "일"][day.getDay() === 0 ? 6 : day.getDay() - 1]} {day.getMonth() + 1}/{day.getDate()}</div>
                                <div className="flex flex-col gap-1">
                                  {groups.map((g) => {
                                    if (g.items.length === 0) return null;
                                    const groupKey = `${cid}_${dayIdx}_${g.key}`;
                                    const groupOpen = scheduleGroupOpen[groupKey] !== false;
                                    return (
                                      <div key={g.key}>
                                        <button onClick={() => setScheduleGroupOpen((s) => ({ ...s, [groupKey]: !s[groupKey] }))} className="flex w-full items-center gap-1 py-0.5 text-[10.5px] font-semibold text-[#79766D]">
                                          <ChevronDown size={10} style={{ transform: groupOpen ? "rotate(0deg)" : "rotate(-90deg)" }} />
                                          {g.label} {g.items.length}건
                                        </button>
                                        {groupOpen && (
                                          <div className="flex flex-col gap-1 pb-1 pl-2.5">
                                            {g.items.map((t) => (
                                              <button key={t.id} onClick={() => setScheduleTaskModal(t)} className={`rounded-md px-1.5 py-1 text-left text-[10.5px] ${g.cls}`}>
                                                <div className="font-semibold">{t.project?.name}</div>
                                                <div>{episodeLabel(t)} · {t.category?.label ?? "미지정"}</div>
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                  {waitingToday.length === 0 && activeToday.length === 0 && doneToday.length === 0 && <div className="text-[10px] text-[#D9D6CC]">-</div>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </>
          ) : projectStatusView && me.role === "manager" ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">프로젝트 현황</h2>
                {me.role === "manager" && (
                  <button onClick={() => { setExportProjectId(scopedProjects[0]?.id ?? ""); setShowExportPicker(true); }} className={`${btnDefault} flex items-center gap-1.5`}>
                    <Download size={14} /> {tr(lang, "excel_download")}
                  </button>
                )}
              </div>
              <div className="overflow-hidden rounded-xl border border-[#E4E1D6] bg-white">
                <div className="grid grid-cols-[1.4fr_0.9fr_0.9fr_0.9fr_0.9fr_0.9fr_1.1fr] border-b border-[#E4E1D6] px-3.5 py-2.5 text-[11px] font-bold text-[#79766D]">
                  <SortHeader label="프로젝트명" col="name" sort={projectSort} onClick={(c) => toggleSort(setProjectSort, c)} />
                  <SortHeader label="진행 상태" col="status" sort={projectSort} onClick={(c) => toggleSort(setProjectSort, c)} />
                  <SortHeader label="등록일" col="created" sort={projectSort} onClick={(c) => toggleSort(setProjectSort, c)} />
                  <SortHeader label="업무 시작일" col="started" sort={projectSort} onClick={(c) => toggleSort(setProjectSort, c)} />
                  <SortHeader label="완료일" col="completed" sort={projectSort} onClick={(c) => toggleSort(setProjectSort, c)} />
                  <SortHeader label="게재 상태" col="publish" sort={projectSort} onClick={(c) => toggleSort(setProjectSort, c)} />
                  <SortHeader label="비고" col="remark" sort={projectSort} onClick={(c) => toggleSort(setProjectSort, c)} />
                </div>
                {sortedStatusProjects.map(({ p, started, simple }) => {
                  const projTasks = tasks.filter((t) => t.project_id === p.id && !t.archived);
                  const isExpanded = !!expandedStatusRows[p.id];
                  const segSort = segmentSort[p.id] ?? { col: "episode", dir: 1 as 1 | -1 };
                  const setSegSort = (fn: (s: { col: string; dir: 1 | -1 }) => { col: string; dir: 1 | -1 }) =>
                    setSegmentSort((all) => ({ ...all, [p.id]: fn(all[p.id] ?? { col: "episode", dir: 1 }) }));
                  return (
                    <div key={p.id} className="border-b border-[#E4E1D6]">
                      <div className="grid grid-cols-[1.4fr_0.9fr_0.9fr_0.9fr_0.9fr_0.9fr_1.1fr] items-center px-3.5 py-2.5 text-[12.5px]">
                        <button onClick={() => setExpandedStatusRows((s) => ({ ...s, [p.id]: !s[p.id] }))} className="flex items-center gap-1.5 text-left font-semibold">
                          <ChevronDown size={13} style={{ transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)" }} className="flex-shrink-0 text-[#A7A399]" />
                          {p.name}
                        </button>
                        <span><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${PROJECT_STATUS_COLOR[simple === "완료" ? "업로드 완료" : simple === "검수 중" ? "검수 중" : simple === "진행 중" ? "작업 중" : "준비 중"]}`}>{simple}</span></span>
                        <span className="text-[#79766D]">{fmtDate(p.created_at)}</span>
                        <span className="text-[#79766D]">{started ? fmtDate(started) : "-"}</span>
                        <span className="text-[#79766D]">{p.completed_at ? fmtDate(p.completed_at) : "-"}</span>
                        <span>
                          {p.upload_decision === "confirmed" && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">완료</span>}
                          {p.upload_decision === "declined" && (
                            <span onClick={() => setViewDeclineProjectId(p.id)} className="cursor-pointer rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700">불가</span>
                          )}
                          {!p.upload_decision && <span className="text-[#A7A399]">-</span>}
                        </span>
                        <span onClick={() => { setRemarkModalProjectId(p.id); setRemarkDraft(p.remark || ""); }} className={`cursor-pointer text-[12px] ${p.remark ? "" : "text-[#A7A399]"}`}>
                          {p.remark ? (p.remark.length > 14 ? p.remark.slice(0, 14) + "…" : p.remark) : "+ 입력"}
                        </span>
                      </div>
                      {isExpanded && (
                        <div className="bg-[#FAFAF7] px-3.5 pb-3">
                          <div className="grid grid-cols-[0.8fr_0.8fr_0.4fr_0.8fr_1.2fr_1.2fr_0.9fr_1fr] gap-0 border-b border-[#E4E1D6] py-1.5 text-[10.5px] font-bold text-[#A7A399]">
                            <SortHeader label="에피소드" col="episode" sort={segSort} onClick={(c) => toggleSort(setSegSort, c)} />
                            <SortHeader label="업무" col="category" sort={segSort} onClick={(c) => toggleSort(setSegSort, c)} />
                            <span>차수</span>
                            <SortHeader label="외주 작업자" col="contractor" sort={segSort} onClick={(c) => toggleSort(setSegSort, c)} />
                            <SortHeader label="시작일시" col="started" sort={segSort} onClick={(c) => toggleSort(setSegSort, c)} />
                            <SortHeader label="종료일시" col="ended" sort={segSort} onClick={(c) => toggleSort(setSegSort, c)} />
                            <span>작업시간</span><span>평점</span>
                          </div>
                          {(() => {
                            const rows = projTasks.flatMap((t) => {
                              const segs = [...(t.assignments ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
                              return segs.map((seg, i) => ({ t, seg, seq: i + 1 }));
                            });
                            const segVal = (r: (typeof rows)[number]) => {
                              switch (segSort.col) {
                                case "category": return r.t.category?.label ?? "";
                                case "contractor": return r.seg.contractor?.name ?? "";
                                case "started": return r.seg.started_at ?? "";
                                case "ended": return r.seg.ended_at ?? "";
                                default: return episodeLabel(r.t);
                              }
                            };
                            const sortedRows = [...rows].sort((a, b) => segVal(a).localeCompare(segVal(b)) * segSort.dir);
                            return sortedRows.map(({ t, seg, seq }) => (
                              <div key={seg.id} className="grid grid-cols-[0.8fr_0.8fr_0.4fr_0.8fr_1.2fr_1.2fr_0.9fr_1fr] items-center gap-0 border-b border-[#EEEDE7] py-1.5 text-[11.5px] last:border-b-0">
                                <span>{episodeLabel(t)}</span>
                                <span className="text-[#79766D]">{t.category?.label ?? "미지정"}</span>
                                <span className="text-[#79766D]">{seq}차</span>
                                <span>{seg.contractor?.name ?? "-"}</span>
                                <span className="text-[#79766D]">{seg.started_at ? fmtDateTime(seg.started_at) : "-"}</span>
                                <span className="text-[#79766D]">{seg.ended_at ? fmtDateTime(seg.ended_at) : "-"}</span>
                                <span className="text-[#79766D]">{workDuration(seg.started_at, seg.ended_at) ?? "-"}</span>
                                <span className="flex gap-0.5">
                                  {seg.ended_at ? [1, 2, 3, 4, 5].map((n) => (
                                    <button key={n} onClick={() => rateAssignment(seg.id, n)} title={`${n}점`}>
                                      <Star size={13} className={n <= (seg.rating ?? 0) ? "fill-amber-400 text-amber-400" : "text-[#D9D6CC]"} />
                                    </button>
                                  )) : <span className="text-[#D9D6CC]">-</span>}
                                </span>
                              </div>
                            ));
                          })()}
                          {projTasks.length === 0 && <div className="py-2 text-xs text-[#A7A399]">등록된 업무가 없습니다.</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
                {scopedProjects.length === 0 && <div className="p-6 text-center text-sm text-[#A7A399]">프로젝트가 없습니다.</div>}
              </div>
            </>
          ) : selectedProject || isAllView ? (
            <>
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  {isAllView ? (
                    <h2 className="text-lg font-bold">전체 업무</h2>
                  ) : (
                    <>
                      <div className="mb-0.5 text-[11px] text-[#A7A399]">{selectedProject!.code} / {taskCountLabel(lang, rawScopeTasks.length)} / {ddayLabel(selectedProject!)}</div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold">{selectedProject!.name}</h2>
                        {me.role === "manager" && !selectedProject!.archived && (
                          <button onClick={openEditProject} title="프로젝트 수정"><Pencil size={14} className="text-[#79766D]" /></button>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {!isAllView && (
                  <div>
                    {selectedProject!.archived ? (
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-400">삭제됨</span>
                    ) : (
                      <div onClick={() => me.role === "manager" && openStatusModal()} className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-[#E4E1D6] bg-[#F6F5F0] px-3 py-2" style={{ cursor: me.role === "manager" ? "pointer" : "default" }}>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${PROJECT_STATUS_COLOR[computeProjectStatus(selectedProject!, tasks)]}`}>{projectStatusLabel(computeProjectStatus(selectedProject!, tasks), lang)}</span>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusPillStyle(selectedProject!.volume_check)}`}>{tr(lang, "sound_check")} {selectedProject!.volume_check}</span>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusPillStyle(selectedProject!.upload_status)}`}>{tr(lang, "upload_check")} {selectedProject!.upload_status}</span>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusPillStyle(selectedProject!.review_status)}`}>{tr(lang, "qc")} {selectedProject!.review_status}</span>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${selectedProject!.upload_decision === "confirmed" ? "bg-emerald-50 text-emerald-700" : selectedProject!.upload_decision === "declined" ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-500"}`}>
                          {tr(lang, "pub_label")} {selectedProject!.upload_decision === "confirmed" ? tr(lang, "pub_done") : selectedProject!.upload_decision === "declined" ? tr(lang, "pub_declined") : tr(lang, "pub_not_yet")}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {!isAllView && !selectedProject!.archived && (
                <div className="mb-3.5 flex flex-wrap items-center gap-1.5">
                  <button onClick={() => setSelectedEpisodeId("ALL")} className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${selectedEpisodeId === "ALL" ? "bg-[#1F1E1B] text-white" : "bg-[#EEEDE7] text-[#79766D]"}`}>{tr(lang, "all_short")}</button>
                  {(selectedProject!.episodes ?? []).map((ep) => (
                    <button key={ep.id} onClick={() => setSelectedEpisodeId(ep.id)} className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${selectedEpisodeId === ep.id ? "bg-[#1F1E1B] text-white" : "bg-[#EEEDE7] text-[#79766D]"}`}>{ep.label}</button>
                  ))}
                  {me.role === "manager" && (
                    <button onClick={() => setShowEpisodeManage(true)} className="ml-1 flex items-center gap-1 text-[12px] font-semibold text-[#2C56C9]"><Settings size={12} /> 수정</button>
                  )}
                </div>
              )}

              {!isAllView && !selectedProject!.archived && (selectedProject!.episodes ?? []).length > 0 && categories.length > 0 && (
                <div className="mb-3.5 overflow-x-auto rounded-xl border border-[#E4E1D6] bg-white p-3">
                  <button onClick={() => setShowEpisodeMatrix((v) => !v)} className="mb-1 flex items-center gap-1.5 text-[12px] font-bold text-[#79766D]">
                    <ChevronDown size={13} style={{ transform: showEpisodeMatrix ? "rotate(0deg)" : "rotate(-90deg)" }} />
                    {tr(lang, "work_status")}
                  </button>
                  {showEpisodeMatrix && (
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr>
                          <th className="pb-1.5 pr-2 text-left font-bold text-[#79766D]">에피소드</th>
                          {categories.map((c) => <th key={c.id} className="px-1 pb-1.5 text-center font-bold text-[#79766D]">{c.label}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedEpisodeId === "ALL" ? (selectedProject!.episodes ?? []) : (selectedProject!.episodes ?? []).filter((ep) => ep.id === selectedEpisodeId)).map((ep) => (
                          <tr key={ep.id}>
                            <td className="py-1 pr-2 font-semibold">{ep.label}</td>
                            {categories.map((c) => {
                              const cellTasks = rawScopeTasks.filter((t) => t.episode_id === ep.id && t.category_id === c.id);
                              let cell: { label: string; cls: string };
                              if (cellTasks.length === 0) cell = { label: "-", cls: "text-[#D9D6CC]" };
                              else if (cellTasks.every((t) => t.status === "done")) cell = { label: tr(lang, "label_complete"), cls: "bg-emerald-50 text-emerald-700" };
                              else if (cellTasks.some((t) => t.status !== "waiting")) cell = { label: tr(lang, "label_working"), cls: "bg-blue-50 text-blue-700" };
                              else cell = { label: tr(lang, "label_pending"), cls: "bg-gray-100 text-gray-500" };
                              return (
                                <td key={c.id} className="px-1 py-1 text-center">
                                  <span className={`inline-block w-full rounded-md px-1.5 py-1 font-semibold ${cell.cls}`}>{cell.label}</span>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}


              {!isAllView && selectedProject!.upload_decision === "declined" && selectedProject!.decline_reason && (
                <div className="mb-3.5 text-xs text-red-600">게재 불가 사유: {selectedProject!.decline_reason}</div>
              )}

              {!isAllView && !selectedProject!.archived && me.role === "manager" && allTasksDone(selectedProject!, tasks) && selectedProject!.review_status === "Complete" && !selectedProject!.upload_decision && (
                <div className="mb-5 flex items-center gap-2.5 rounded-xl bg-violet-50 px-3.5 py-2.5 text-sm">
                  <span className="font-semibold text-violet-700">프로젝트가 서비스에 게재 되었나요?</span>
                  <div className="ml-auto flex gap-2">
                    <button onClick={handlePublishConfirm} className={`${btnSuccess} flex items-center gap-1.5`}><UploadCloud size={13} /> 게재 확인</button>
                    <button onClick={openDeclineModal} className={`${btnDanger} flex items-center gap-1.5`}><X size={13} /> 게재 불가</button>
                  </div>
                </div>
              )}

              <div className="mb-3.5 flex items-center justify-between gap-3">
                {isAllView ? (
                  <div className="relative flex-1 max-w-xs">
                    <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#A7A399]" />
                    <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={tr(lang, "search_placeholder")} className="w-full rounded-lg border border-[#E4E1D6] py-2 pl-8 pr-3 text-[13px]" />
                  </div>
                ) : <div />}
                <div className="flex items-center gap-2">
                  {me.role === "contractor" && (
                    <div className="flex rounded-lg bg-[#EEEDE7] p-0.5">
                      <button onClick={() => setContractorShowAll(false)} className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold ${!contractorShowAll ? "bg-white" : "text-[#79766D]"}`}>{tr(lang, "my_tasks")}</button>
                      <button onClick={() => setContractorShowAll(true)} className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold ${contractorShowAll ? "bg-white" : "text-[#79766D]"}`}>{tr(lang, "all_tasks_toggle")}</button>
                    </div>
                  )}
                  {!isAllView && !selectedProject!.archived && me.role === "manager" && (
                    <button onClick={() => { setNewTaskIsInternal(false); setNewTask({ category_id: categories[0]?.id ?? "", episode_id: selectedEpisodeId !== "ALL" ? selectedEpisodeId : (selectedProject!.episodes?.[0]?.id ?? ""), contractor_id: contractors[0]?.id ?? "", manager_id: me.id, planned_start_date: nowLocalDateTimeStr(), memo: "", sub_manager_ids: [], no_order_constraint: false }); setShowNewTask(true); }} className={`${btnPrimary} flex items-center gap-1.5`}>
                      <Plus size={14} /> {tr(lang, "register_task")}
                    </button>
                  )}
                  <div className="flex rounded-lg bg-[#EEEDE7] p-0.5">
                    <button onClick={() => setViewMode("category")} className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold ${viewMode === "category" ? "bg-white" : "text-[#79766D]"}`}>{tr(lang, "by_category")}</button>
                    <button onClick={() => setViewMode("status")} className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold ${viewMode === "status" ? "bg-white" : "text-[#79766D]"}`}>{tr(lang, "by_status")}</button>
                  </div>
                </div>
              </div>

              {viewMode === "category" ? (
                <div className="flex flex-col gap-5">
                  {categories.map((cat) => (grouped[cat.id]?.length ?? 0) > 0 && (
                    <div key={cat.id}>
                      <div className="mb-2.5 text-[12.5px] font-bold text-[#79766D]">{cat.label} <span className="font-medium text-[#A7A399]">· {grouped[cat.id].length}건</span></div>
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                        {grouped[cat.id].map((t) => <TaskCard key={t.id} t={t} />)}
                      </div>
                    </div>
                  ))}
                  {(grouped["UNASSIGNED"]?.length ?? 0) > 0 && (
                    <div>
                      <div className="mb-2.5 text-[12.5px] font-bold text-[#79766D]">미지정 (삭제된 카테고리) <span className="font-medium text-[#A7A399]">· {grouped["UNASSIGNED"].length}건</span></div>
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                        {grouped["UNASSIGNED"].map((t) => <TaskCard key={t.id} t={t} />)}
                      </div>
                    </div>
                  )}
                  {visibleTasks.length === 0 && <div className="text-sm text-[#A7A399]">표시할 업무가 없습니다.</div>}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {[{ key: "waiting", label: "진행 대기 중" }, { key: "active", label: "진행 중" }, { key: "done", label: "완료" }].map((col) => (
                    <div key={col.key}>
                      <div className="mb-2.5 flex justify-between text-xs font-bold text-[#79766D]"><span>{col.label}</span><span>{grouped[col.key]?.length ?? 0}</span></div>
                      <div className="flex flex-col gap-2.5">
                        {(grouped[col.key] ?? []).map((t) => <TaskCard key={t.id} t={t} />)}
                        {(grouped[col.key]?.length ?? 0) === 0 && <div className="text-xs text-[#A7A399]">없음</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {me.role === "contractor" && myCompletedTasks.length > 0 && (
                <div className="mt-7">
                  <button onClick={() => setShowCompletedTasks((v) => !v)} className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#79766D]">
                    <ChevronDown size={13} style={{ transform: showCompletedTasks ? "rotate(0deg)" : "rotate(-90deg)" }} />
                    {tr(lang, "completed_tasks_section")} · {myCompletedTasks.length}
                  </button>
                  {showCompletedTasks && (
                    <div className="mt-2.5 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                      {myCompletedTasks.map((t) => {
                        const cur = currentAssignment(t);
                        return (
                          <div key={t.id} className="rounded-xl border border-[#E4E1D6] bg-white p-3.5">
                            <div className="mb-1.5 text-[10.5px] text-[#A7A399]">{t.project!.code} / {t.code} / {t.project!.name}</div>
                            <div className="mb-1.5 text-[15px] font-bold">{episodeLabel(t)}</div>
                            <div className="mb-2 text-xs text-emerald-700">{tr(lang, "label_complete")}</div>
                            <div className="flex justify-between text-[11px] text-[#A7A399]">
                              <span>{cur?.started_at ? `${tr(lang, "start_short")} ${fmtDateTime(cur.started_at)}` : "-"}</span>
                              <span>{cur?.ended_at ? `${tr(lang, "end_short")} ${fmtDateTime(cur.ended_at)}` : "-"}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {me.role === "contractor" && pastAssignments.length > 0 && (
                <div className="mt-7">
                  <button onClick={() => setShowPastAssignments((v) => !v)} className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#79766D]">
                    <ChevronDown size={13} style={{ transform: showPastAssignments ? "rotate(0deg)" : "rotate(-90deg)" }} />
                    {tr(lang, "past_assignments_section")} · {pastAssignments.length}
                  </button>
                  {showPastAssignments && (
                    <div className="mt-2.5 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                      {pastAssignments.map((a) => (
                        <div key={a.id} className="rounded-xl border border-[#E4E1D6] bg-white p-3.5 opacity-75">
                          <div className="mb-1.5 text-[10.5px] text-[#A7A399]">{a.task.project?.code} / {a.task.code} / {a.task.project?.name}</div>
                          <div className="mb-1.5 text-[15px] font-bold">{a.task.episode?.label ?? "적용 안함"}</div>
                          <div className="mb-2 text-xs font-semibold text-gray-500">{tr(lang, "handed_off")}</div>
                          <div className="flex justify-between text-[11px] text-[#A7A399]">
                            <span>{a.started_at ? `${tr(lang, "start_short")} ${fmtDateTime(a.started_at)}` : "-"}</span>
                            <span>{a.ended_at ? `${tr(lang, "end_short")} ${fmtDateTime(a.ended_at)}` : "-"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {archivedTasksInScope.length > 0 && (
                <div className="mt-7">
                  <button onClick={() => setShowArchivedTasks((v) => !v)} className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#79766D]">
                    <ChevronDown size={13} style={{ transform: showArchivedTasks ? "rotate(0deg)" : "rotate(-90deg)" }} />
                    {tr(lang, "archived_tasks_section")} · {archivedTasksInScope.length}
                  </button>
                  {showArchivedTasks && (
                    <div className="mt-2.5 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                      {archivedTasksInScope.map((t) => (
                        <div key={t.id} className="rounded-xl border border-[#E4E1D6] bg-white p-3.5 opacity-60">
                          <div className="mb-1.5 text-[10.5px] text-[#A7A399]">{t.project!.code} / {t.code} / {t.project!.name}</div>
                          <div className="mb-2 text-sm font-bold">{episodeLabel(t)}</div>
                          <div className="mb-2.5 text-xs text-[#79766D]">{contractorName(t)}</div>
                          {me.role === "manager" && (
                            <div className="flex gap-2">
                              <button onClick={() => restoreTask(t)} className={`${btnDefault} flex flex-1 items-center justify-center gap-1.5`}><RotateCcw size={13} /> 복원</button>
                              <button onClick={() => permanentlyDeleteTask(t)} className={`${btnDanger} flex items-center gap-1.5`}><XCircle size={13} /></button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-[#A7A399]">좌측에서 프로젝트를 선택해주세요.</div>
          )}
        </main>
      </div>

      {/* 대분류 관리 */}
      {showMcManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" onClick={() => setShowMcManage(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[380px] rounded-2xl bg-white p-5">
            <h3 className="mb-3.5 text-[15.5px] font-bold">대분류 관리</h3>
            <div className="mb-3 flex gap-1.5">
              <input placeholder="새 대분류 추가" value={newMcLabel} onChange={(e) => setNewMcLabel(e.target.value)} className={inputCls} style={{ flex: 1 }} />
              <button onClick={addMajorCategory} className={btnDefault}><Plus size={13} /></button>
            </div>
            <div className="flex flex-col gap-2">
              {majorCategories.map((mc) => (
                <div key={mc.id} className="flex items-center justify-between rounded-lg border border-[#E4E1D6] px-2.5 py-2">
                  <span className="text-[13px] font-semibold">{mc.label}</span>
                  <div className="flex gap-1.5">
                    <button onClick={() => renameMajorCategory(mc.id, mc.label)}><Pencil size={14} /></button>
                    <button onClick={() => deleteMajorCategory(mc.id)} className="text-red-600"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3.5"><button onClick={() => setShowMcManage(false)} className={btnDefault}>닫기</button></div>
          </div>
        </div>
      )}

      {/* 에피소드 관리 */}
      {showEpisodeManage && selectedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" onClick={() => setShowEpisodeManage(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[380px] rounded-2xl bg-white p-5">
            <h3 className="mb-3.5 text-[15.5px] font-bold">에피소드 관리</h3>
            <div className="mb-3 flex gap-1.5">
              <input placeholder="새 에피소드 추가" value={newEpLabel} onChange={(e) => setNewEpLabel(e.target.value)} className={inputCls} style={{ flex: 1 }} />
              <button onClick={addEpisode} className={btnDefault}><Plus size={13} /></button>
            </div>
            <div className="flex flex-col gap-2">
              {(selectedProject.episodes ?? []).map((ep) => (
                <div key={ep.id} className="flex items-center justify-between rounded-lg border border-[#E4E1D6] px-2.5 py-2">
                  <span className="text-[13px] font-semibold">{ep.label}</span>
                  <div className="flex gap-1.5">
                    <button onClick={() => renameEpisode(ep.id, ep.label)}><Pencil size={14} /></button>
                    <button onClick={() => deleteEpisode(ep.id)} className="text-red-600"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
              {(selectedProject.episodes ?? []).length === 0 && <div className="text-xs text-[#A7A399]">등록된 에피소드가 없습니다.</div>}
            </div>
            <div className="mt-3.5"><button onClick={() => setShowEpisodeManage(false)} className={btnDefault}>닫기</button></div>
          </div>
        </div>
      )}

      {/* 새 프로젝트 */}
      {showNewProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" onClick={() => setShowNewProject(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[380px] rounded-2xl bg-white p-5">
            <h3 className="mb-3.5 text-[15.5px] font-bold">새 프로젝트</h3>
            <label className="mb-1 block text-xs text-[#79766D]">대분류</label>
            <select value={newProjectDraft.major_category_id} onChange={(e) => setNewProjectDraft({ ...newProjectDraft, major_category_id: e.target.value })} className={`${inputCls} mb-2.5`}>
              <option value="">대분류 선택</option>
              {majorCategories.map((mc) => <option key={mc.id} value={mc.id}>{mc.label}</option>)}
            </select>
            <label className="mb-1 block text-xs text-[#79766D]">프로젝트 넘버</label>
            <input value={newProjectDraft.code} onChange={(e) => setNewProjectDraft({ ...newProjectDraft, code: e.target.value })} className={`${inputCls} mb-2.5`} placeholder="예: P004" />
            <label className="mb-1 block text-xs text-[#79766D]">프로젝트명</label>
            <input value={newProjectDraft.name} onChange={(e) => setNewProjectDraft({ ...newProjectDraft, name: e.target.value })} className={`${inputCls} mb-2.5`} />
            {projectFormError && <div className="mb-2.5 text-xs text-red-600">{projectFormError}</div>}
            <div className="flex gap-2">
              <button onClick={submitNewProject} className={btnPrimary}>등록</button>
              <button onClick={() => setShowNewProject(false)} className={btnDefault}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 프로젝트 수정 (+ 삭제 버튼 포함) */}
      {editProjectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" onClick={() => setEditProjectOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[380px] rounded-2xl bg-white p-5">
            <h3 className="mb-3.5 text-[15.5px] font-bold">프로젝트 수정</h3>
            <label className="mb-1 block text-xs text-[#79766D]">프로젝트 넘버</label>
            <input value={editProjectDraft.code} onChange={(e) => setEditProjectDraft({ ...editProjectDraft, code: e.target.value })} className={`${inputCls} mb-2.5`} />
            <label className="mb-1 block text-xs text-[#79766D]">프로젝트명</label>
            <input value={editProjectDraft.name} onChange={(e) => setEditProjectDraft({ ...editProjectDraft, name: e.target.value })} className={`${inputCls} mb-2.5`} />
            {editProjectError && <div className="mb-2.5 text-xs text-red-600">{editProjectError}</div>}
            <div className="flex items-center gap-2">
              <button onClick={saveEditProject} className={btnPrimary}>저장</button>
              <button onClick={() => setEditProjectOpen(false)} className={btnDefault}>취소</button>
              <button onClick={deleteProjectFromModal} className={`${btnDanger} ml-auto flex items-center gap-1.5`}><Trash2 size={13} /> 삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* 프로젝트 상태 수정 */}
      {statusModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" onClick={() => setStatusModalOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-[460px] overflow-y-auto rounded-2xl bg-white p-5">
            <h3 className="mb-1 text-[15.5px] font-bold">프로젝트 상태 수정</h3>
            <p className="mb-4 text-xs text-[#A7A399]">{selectedProject!.code} · {selectedProject!.name}</p>
            <div className="mb-5 flex flex-col gap-3">
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs text-[#79766D]"><Volume2 size={13} /> 음량 확인</label>
                <select value={draftStatus.volume_check} onChange={(e) => setDraftStatus({ ...draftStatus, volume_check: e.target.value })} className={inputCls}>
                  {["Not yet", "Complete"].map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs text-[#79766D]"><UploadCloud size={13} /> 업로드 확인</label>
                <select value={draftStatus.upload_status} onChange={(e) => setDraftStatus({ ...draftStatus, upload_status: e.target.value })} className={inputCls}>
                  <option value="Not yet">Not yet</option>
                  <option value="Complete" disabled={!projectDone}>Complete{!projectDone ? " (모든 업무 완료 필요)" : ""}</option>
                </select>
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs text-[#79766D]"><ClipboardCheck size={13} /> 검수 상태</label>
                <select value={draftStatus.review_status} onChange={(e) => setDraftStatus({ ...draftStatus, review_status: e.target.value })} className={inputCls}>
                  <option value="Not yet">Not yet</option>
                  <option value="Revision">Revision</option>
                  <option value="Complete" disabled={!projectDone}>Complete{!projectDone ? " (모든 업무 완료 필요)" : ""}</option>
                </select>
              </div>
              {!projectDone && <p className="text-[11.5px] text-[#A7A399]">모든 업무가 완료 상태가 되어야 업로드/검수를 Complete로 바꿀 수 있습니다. (삭제된 업무는 계산에서 제외됩니다)</p>}
            </div>
            <div className="mb-5 flex gap-2">
              <button onClick={saveStatus} className={btnPrimary}>저장</button>
              <button onClick={() => setStatusModalOpen(false)} className={btnDefault}>취소</button>
            </div>
            <div className="border-t border-[#E4E1D6] pt-3.5">
              <div className="mb-2 text-xs font-bold text-[#79766D]">변경 로그</div>
              <div className="max-h-44 overflow-y-auto">
                {projectLogs.length === 0 && <div className="text-xs text-[#A7A399]">기록이 없습니다.</div>}
                {projectLogs.map((l) => (
                  <div key={l.id} className="border-t border-[#E4E1D6] py-1.5 text-xs first:border-t-0">
                    <span className="text-[#A7A399]">{new Date(l.created_at).toLocaleString("ko-KR")}</span> · <span className="font-semibold">{l.actor_name}</span>
                    <div className="mt-0.5 text-[#79766D]">{l.change}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 게시 불가 사유 */}
      {declineModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" onClick={() => setDeclineModalOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[400px] rounded-2xl bg-white p-5">
            <h3 className="mb-3 text-[15.5px] font-bold">게재 불가 사유가 무엇인가요?</h3>
            <textarea rows={4} value={declineReasonDraft} onChange={(e) => setDeclineReasonDraft(e.target.value)} placeholder="게재가 불가한 이유를 입력해주세요." className={`${inputCls} mb-3 resize-y`} />
            <div className="flex gap-2">
              <button onClick={submitDecline} disabled={!declineReasonDraft.trim()} className={`${btnDanger} disabled:opacity-50`}>제출</button>
              <button onClick={() => setDeclineModalOpen(false)} className={btnDefault}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 비고 */}
      {remarkModalProjectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" onClick={() => setRemarkModalProjectId(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[400px] rounded-2xl bg-white p-5">
            <h3 className="mb-3 text-[15.5px] font-bold">비고</h3>
            <textarea rows={4} value={remarkDraft} onChange={(e) => setRemarkDraft(e.target.value)} className={`${inputCls} mb-3 resize-y`} />
            <div className="flex gap-2">
              <button onClick={async () => { await supabase.from("projects").update({ remark: remarkDraft }).eq("id", remarkModalProjectId); setRemarkModalProjectId(null); load(); }} className={btnPrimary}>저장</button>
              <button onClick={() => setRemarkModalProjectId(null)} className={btnDefault}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 게시 불가 사유 열람 */}
      {viewDeclineProjectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" onClick={() => setViewDeclineProjectId(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[380px] rounded-2xl bg-white p-5">
            <h3 className="mb-3 text-[15.5px] font-bold">게재 불가 사유</h3>
            <p className="mb-3.5 text-sm text-red-600">{projects.find((p) => p.id === viewDeclineProjectId)?.decline_reason || "사유가 기록되지 않았습니다."}</p>
            <button onClick={() => setViewDeclineProjectId(null)} className={btnDefault}>닫기</button>
          </div>
        </div>
      )}

      {/* 새 업무 등록 */}
      {showNewTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" onClick={() => setShowNewTask(false)}>
          <div onClick={(e) => e.stopPropagation()} className="max-h-[88vh] w-[440px] overflow-y-auto rounded-2xl bg-white p-5">
            <h3 className="mb-3.5 text-[15.5px] font-bold">새 업무 등록</h3>

            <div className="mb-3">
              <label className="mb-1 block text-xs text-[#79766D]">에피소드</label>
              <select value={newTask.episode_id} onChange={(e) => setNewTask({ ...newTask, episode_id: e.target.value })} className={inputCls}>
                <option value="">적용 안함</option>
                {selectedProject?.episodes?.map((ep) => <option key={ep.id} value={ep.id}>{ep.label}</option>)}
              </select>
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-xs text-[#79766D]">카테고리</label>
              <select value={newTask.category_id} onChange={(e) => setNewTask({ ...newTask, category_id: e.target.value })} className={`${inputCls} mb-2`}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <div className="mb-1.5 flex gap-1.5">
                <input placeholder="새 카테고리 추가" value={newCatLabel} onChange={(e) => setNewCatLabel(e.target.value)} className={inputCls} style={{ flex: 1 }} />
                <button onClick={addCategory} className={btnDefault}><Plus size={13} /></button>
              </div>
              <p className="mb-1 text-[10.5px] text-[#A7A399]">순서는 같은 에피소드 안에서 업무 진행 순서로 쓰입니다 (위 → 아래 순).</p>
              <div className="flex flex-col gap-1">
                {categories.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-1.5 rounded-lg bg-[#EEEDE7] py-1 pl-2.5 pr-1.5 text-[11px]">
                    <span className="w-4 text-[#A7A399]">{i + 1}</span>
                    <span className="flex-1">{c.label}</span>
                    <button onClick={() => moveCategory(i, -1)} disabled={i === 0} className="disabled:opacity-30"><ChevronUp size={13} /></button>
                    <button onClick={() => moveCategory(i, 1)} disabled={i === categories.length - 1} className="disabled:opacity-30"><ChevronDown size={13} /></button>
                    <Pencil size={11} className="cursor-pointer" onClick={() => renameCategory(c.id, c.label)} />
                    <Trash2 size={11} className="cursor-pointer text-red-600" onClick={() => deleteCategory(c.id)} />
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-3">
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-xs text-[#79766D]">{newTaskIsInternal ? "내부 진행자" : "외주 작업자"}</label>
                <div className="flex rounded-lg bg-[#EEEDE7] p-0.5">
                  <button type="button" onClick={() => { setNewTaskIsInternal(false); setNewTask((n) => ({ ...n, contractor_id: contractors[0]?.id ?? "" })); }} className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold ${!newTaskIsInternal ? "bg-white" : "text-[#79766D]"}`}>외주</button>
                  <button type="button" onClick={() => { setNewTaskIsInternal(true); setNewTask((n) => ({ ...n, contractor_id: managers[0]?.id ?? "" })); }} className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold ${newTaskIsInternal ? "bg-white" : "text-[#79766D]"}`}>내부</button>
                </div>
              </div>
              <select value={newTask.contractor_id} onChange={(e) => setNewTask({ ...newTask, contractor_id: e.target.value })} className={inputCls}>
                {(newTaskIsInternal ? managers : contractors).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <label className="mb-3 flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={newTask.no_order_constraint} onChange={(e) => setNewTask({ ...newTask, no_order_constraint: e.target.checked })} />
              순서 제한 없음
            </label>

            <div className="mb-3">
              <label className="mb-1 block text-xs text-[#79766D]">담당자</label>
              <select value={newTask.manager_id} onChange={(e) => setNewTask({ ...newTask, manager_id: e.target.value })} className={inputCls}>
                {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-xs text-[#79766D]">서브 담당자 (참조 - 확인+의견만 남김)</label>
              <div className="flex flex-wrap gap-1.5">
                {managers.filter((m) => m.id !== newTask.manager_id).map((m) => {
                  const active = newTask.sub_manager_ids.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setNewTask((n) => ({
                        ...n,
                        sub_manager_ids: active ? n.sub_manager_ids.filter((id) => id !== m.id) : [...n.sub_manager_ids, m.id],
                      }))}
                      className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${active ? "bg-[#1F1E1B] text-white" : "bg-[#EEEDE7] text-[#79766D]"}`}
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-xs text-[#79766D]">등록일시 (오늘 이후로 바꾸면 그 시각에 등록 알림 메일 발송)</label>
              <input type="datetime-local" value={newTask.planned_start_date} onChange={(e) => setNewTask({ ...newTask, planned_start_date: e.target.value })} className={inputCls} />
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-xs text-[#79766D]">메모 (등록 알림 메일에 함께 발송됩니다)</label>
              <textarea rows={2} value={newTask.memo} onChange={(e) => setNewTask({ ...newTask, memo: e.target.value })} className={`${inputCls} resize-y`} />
            </div>

            <div className="flex gap-2">
              <button onClick={createTask} className={btnPrimary}>등록</button>
              <button onClick={() => setShowNewTask(false)} className={btnDefault}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 업무 수정 (+ 삭제 버튼 포함) */}
      {editTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" onClick={() => setEditTaskId(null)}>
          <div onClick={(e) => e.stopPropagation()} className="max-h-[88vh] w-[400px] overflow-y-auto rounded-2xl bg-white p-5">
            <h3 className="mb-3.5 text-[15.5px] font-bold">업무 수정</h3>
            {(() => {
              const editingTask = tasks.find((t) => t.id === editTaskId);
              const isWaiting = editingTask?.status === "waiting";
              const workerList = editTaskIsInternal ? managers : contractors;
              return (
                <div className="mb-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="block text-xs text-[#79766D]">{editTaskIsInternal ? "내부 진행자" : "외주 작업자"}{!isWaiting && " (대기중 업무만 변경 가능)"}</label>
                    {isWaiting && (
                      <div className="flex rounded-lg bg-[#EEEDE7] p-0.5">
                        <button type="button" onClick={() => { setEditTaskIsInternal(false); setEditTaskDraft((d) => ({ ...d, contractor_id: contractors[0]?.id ?? "" })); }} className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${!editTaskIsInternal ? "bg-white" : "text-[#79766D]"}`}>외주</button>
                        <button type="button" onClick={() => { setEditTaskIsInternal(true); setEditTaskDraft((d) => ({ ...d, contractor_id: managers[0]?.id ?? "" })); }} className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${editTaskIsInternal ? "bg-white" : "text-[#79766D]"}`}>내부</button>
                      </div>
                    )}
                  </div>
                  {isWaiting ? (
                    <select value={editTaskDraft.contractor_id} onChange={(e) => setEditTaskDraft({ ...editTaskDraft, contractor_id: e.target.value })} className={inputCls}>
                      {workerList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  ) : (
                    <div className={`${inputCls} bg-[#F6F5F0] text-[#A7A399]`}>{[...contractors, ...managers].find((c) => c.id === editTaskDraft.contractor_id)?.name ?? "-"}</div>
                  )}
                  {isWaiting && (
                    <>
                      <label className="mb-1 mt-2.5 block text-xs text-[#79766D]">등록일시</label>
                      <input type="datetime-local" value={editTaskDraft.planned_start_date} onChange={(e) => setEditTaskDraft({ ...editTaskDraft, planned_start_date: e.target.value })} className={inputCls} />
                    </>
                  )}
                </div>
              );
            })()}
            <div className="mb-3">
              <label className="mb-1 block text-xs text-[#79766D]">카테고리</label>
              <select value={editTaskDraft.category_id} onChange={(e) => setEditTaskDraft({ ...editTaskDraft, category_id: e.target.value })} className={inputCls}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-[#79766D]">에피소드</label>
              <select value={editTaskDraft.episode_id} onChange={(e) => setEditTaskDraft({ ...editTaskDraft, episode_id: e.target.value })} className={inputCls}>
                <option value="">적용 안함</option>
                {projects.find((p) => p.id === tasks.find((t) => t.id === editTaskId)?.project_id)?.episodes?.map((ep) => <option key={ep.id} value={ep.id}>{ep.label}</option>)}
              </select>
            </div>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-[#79766D]">담당자</label>
              <select value={editTaskDraft.manager_id} onChange={(e) => setEditTaskDraft({ ...editTaskDraft, manager_id: e.target.value })} className={inputCls}>
                {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <p className="mt-1 text-[11px] text-[#A7A399]">외주 작업자 변경은 검수 화면의 "다른 작업자에게 인계"로 처리됩니다.</p>
            </div>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-[#79766D]">서브 담당자 (참조)</label>
              <div className="flex flex-wrap gap-1.5">
                {managers.filter((m) => m.id !== editTaskDraft.manager_id).map((m) => {
                  const active = editTaskDraft.sub_manager_ids.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setEditTaskDraft((n) => ({
                        ...n,
                        sub_manager_ids: active ? n.sub_manager_ids.filter((id) => id !== m.id) : [...n.sub_manager_ids, m.id],
                      }))}
                      className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${active ? "bg-[#1F1E1B] text-white" : "bg-[#EEEDE7] text-[#79766D]"}`}
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mb-4">
              <label className="mb-1 block text-xs text-[#79766D]">메모</label>
              <textarea rows={2} value={editTaskDraft.memo} onChange={(e) => setEditTaskDraft({ ...editTaskDraft, memo: e.target.value })} className={`${inputCls} resize-y`} />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={saveEditTask} className={btnPrimary}>저장</button>
              <button onClick={() => setEditTaskId(null)} className={btnDefault}>취소</button>
              <button onClick={archiveTaskFromModal} className={`${btnDanger} ml-auto flex items-center gap-1.5`}><Trash2 size={13} /> 삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* 업무 종료 / 수정완료 - 파일 링크 입력 */}
      {submitModalTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" onClick={() => setSubmitModalTaskId(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[420px] rounded-2xl bg-white p-5">
            <h3 className="mb-3 text-[15.5px] font-bold">작업 파일 링크</h3>
            <p className="mb-2 text-xs text-[#A7A399]">담당자가 확인할 수 있도록 업로드한 파일의 링크를 입력해주세요.</p>
            <input value={fileLinkDraft} onChange={(e) => setFileLinkDraft(e.target.value)} placeholder="https://drive.google.com/..." className={`${inputCls} mb-3`} />
            {myAiAccounts.length > 0 && (
              <div className="mb-3 rounded-lg border border-dashed border-[#E4E1D6] p-3">
                <label className="mb-1 block text-xs text-[#79766D]">사용한 AI 서비스 (선택)</label>
                <select value={submitAiAccountId} onChange={(e) => setSubmitAiAccountId(e.target.value)} className={`${inputCls} mb-2`}>
                  <option value="">사용 안 함</option>
                  {myAiAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.ai_service?.label}{a.account_label ? ` · ${a.account_label}` : ""} (현재 {a.remaining_credit})</option>
                  ))}
                </select>
                {submitAiAccountId && (
                  <input type="number" value={submitNewCredit} onChange={(e) => setSubmitNewCredit(e.target.value)} placeholder="지금 남은 크레딧" className={inputCls} />
                )}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={confirmSubmit} className={btnPrimary}>제출하고 종료</button>
              <button onClick={() => setSubmitModalTaskId(null)} className={btnDefault}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 재작업 요청/수정 메시지 */}
      {reworkModalTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" onClick={() => setReworkModalTaskId(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[420px] rounded-2xl bg-white p-5">
            <h3 className="mb-3 text-[15.5px] font-bold">재작업 요청 메시지</h3>
            <textarea rows={4} value={reworkMessage} onChange={(e) => setReworkMessage(e.target.value)} placeholder="수정이 필요한 부분을 구체적으로 적어주세요." className={`${inputCls} mb-3 resize-y`} />
            <div className="flex gap-2">
              <button onClick={submitRework} disabled={!reworkMessage.trim()} className={`${btnDanger} disabled:opacity-50`}>보내기</button>
              <button onClick={() => setReworkModalTaskId(null)} className={btnDefault}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 다른 작업자에게 인계 */}
      {handoffModalTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" onClick={() => setHandoffModalTaskId(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[420px] rounded-2xl bg-white p-5">
            <h3 className="mb-3 text-[15.5px] font-bold">다른 작업자에게 인계</h3>
            <label className="mb-1 block text-xs text-[#79766D]">인계할 작업자</label>
            <select value={handoffContractorId} onChange={(e) => setHandoffContractorId(e.target.value)} className={`${inputCls} mb-3`}>
              <option value="">선택해주세요</option>
              {contractors.filter((c) => c.id !== tasks.find((t) => t.id === handoffModalTaskId)?.contractor_id).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <label className="mb-1 block text-xs text-[#79766D]">인계 사유</label>
            <textarea rows={4} value={handoffReason} onChange={(e) => setHandoffReason(e.target.value)} placeholder="인계가 필요한 이유를 적어주세요. (비용 지급 기록에도 남습니다)" className={`${inputCls} mb-3 resize-y`} />
            <div className="flex gap-2">
              <button onClick={submitHandoff} disabled={!handoffContractorId || !handoffReason.trim()} className={`${btnPrimary} disabled:opacity-50`}>인계하기</button>
              <button onClick={() => setHandoffModalTaskId(null)} className={btnDefault}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 완료된 업무 재작업/인계 */}
      {reopenModalTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" onClick={() => setReopenModalTaskId(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[420px] rounded-2xl bg-white p-5">
            <h3 className="mb-3 text-[15.5px] font-bold">완료된 업무 재작업</h3>
            <div className="mb-3 flex gap-2">
              <button onClick={() => setReopenMode("rework")} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${reopenMode === "rework" ? "bg-[#1F1E1B] text-white" : "border border-[#E4E1D6]"}`}>재작업 요청</button>
              <button onClick={() => setReopenMode("handoff")} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${reopenMode === "handoff" ? "bg-[#1F1E1B] text-white" : "border border-[#E4E1D6]"}`}>다른 작업자에게 인계</button>
            </div>
            {reopenMode === "handoff" && (
              <>
                <label className="mb-1 block text-xs text-[#79766D]">인계할 작업자</label>
                <select value={reopenContractorId} onChange={(e) => setReopenContractorId(e.target.value)} className={`${inputCls} mb-3`}>
                  <option value="">선택해주세요</option>
                  {contractors.filter((c) => c.id !== tasks.find((t) => t.id === reopenModalTaskId)?.contractor_id).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </>
            )}
            <label className="mb-1 block text-xs text-[#79766D]">사유</label>
            <textarea rows={4} value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder="재작업/인계가 필요한 이유를 적어주세요." className={`${inputCls} mb-3 resize-y`} />
            <p className="mb-3 text-[11px] text-[#A7A399]">작업자는 다시 "업무 시작"을 눌러야 새 구간이 시작됩니다. 여러 번 반복될 수 있으며, 매번 별도로 시간이 기록됩니다.</p>
            <div className="flex gap-2">
              <button onClick={submitReopen} className={btnPrimary}>{reopenMode === "handoff" ? "인계하기" : "재작업 요청"}</button>
              <button onClick={() => setReopenModalTaskId(null)} className={btnDefault}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 담당자 완료 처리 */}
      {forceCompleteTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" onClick={() => setForceCompleteTaskId(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[420px] rounded-2xl bg-white p-5">
            <h3 className="mb-3 text-[15.5px] font-bold">담당자 완료 처리</h3>
            <p className="mb-2 text-xs text-[#A7A399]">작업자가 완료 처리를 하지 않는 경우 등, 담당자가 직접 완료 처리할 수 있습니다. 시작/종료 시각과 평점은 기록되지 않습니다.</p>
            <label className="mb-1 block text-xs text-[#79766D]">사유</label>
            <textarea rows={4} value={forceCompleteReason} onChange={(e) => setForceCompleteReason(e.target.value)} placeholder="완료 처리 사유를 입력해주세요." className={`${inputCls} mb-3 resize-y`} />
            <div className="flex gap-2">
              <button onClick={submitForceComplete} className={btnPrimary}>완료 처리</button>
              <button onClick={() => setForceCompleteTaskId(null)} className={btnDefault}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 서브 담당자 확인 + 의견 */}
      {subManagerAckTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" onClick={() => setSubManagerAckTaskId(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[420px] rounded-2xl bg-white p-5">
            <h3 className="mb-3 text-[15.5px] font-bold">확인 + 의견</h3>
            <p className="mb-2 text-xs text-[#A7A399]">검수 권한은 없으며, 확인 처리 시 메인 담당자에게 메일이 발송됩니다.</p>
            <textarea rows={4} value={subManagerAckComment} onChange={(e) => setSubManagerAckComment(e.target.value)} placeholder="의견 (선택)" className={`${inputCls} mb-3 resize-y`} />
            <div className="flex gap-2">
              <button onClick={submitSubManagerAck} className={btnPrimary}>확인 완료</button>
              <button onClick={() => setSubManagerAckTaskId(null)} className={btnDefault}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 일정 관리 - 업무 상세 (TaskCard 재사용) */}
      {scheduleTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" onClick={() => setScheduleTaskModal(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[340px]">
            <TaskCard t={tasks.find((t) => t.id === scheduleTaskModal.id) ?? scheduleTaskModal} />
            <button onClick={() => setScheduleTaskModal(null)} className="mt-2 w-full rounded-lg border border-[#E4E1D6] bg-white px-3.5 py-2 text-sm">닫기</button>
          </div>
        </div>
      )}

      {/* 일정 관리 - 작업자 AI 서비스 계정 (읽기 전용) */}
      {scheduleAiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" onClick={() => setScheduleAiModal(null)}>
          <div onClick={(e) => e.stopPropagation()} className="max-h-[80vh] w-[420px] overflow-y-auto rounded-2xl bg-white p-5">
            <h3 className="mb-3.5 text-[15.5px] font-bold">{scheduleAiModal.name}님의 AI 서비스 계정</h3>
            {scheduleAiLoading && <div className="text-xs text-[#A7A399]">불러오는 중...</div>}
            {!scheduleAiLoading && scheduleAiAccounts.length === 0 && <div className="text-xs text-[#A7A399]">등록된 AI 계정이 없습니다.</div>}
            <div className="flex flex-col gap-2">
              {scheduleAiAccounts.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border border-[#E4E1D6] px-3 py-2">
                  <div>
                    <div className="text-[13px] font-semibold">{a.ai_service?.label}{a.account_label ? ` · ${a.account_label}` : ""}</div>
                    <div className="text-[11px] text-[#A7A399]">잔여 크레딧</div>
                  </div>
                  <div className={`text-[14px] font-bold ${Number(a.remaining_credit) <= 0 ? "text-red-600" : ""}`}>{a.remaining_credit}</div>
                </div>
              ))}
            </div>
            <button onClick={() => setScheduleAiModal(null)} className="mt-3.5 rounded-lg border border-[#E4E1D6] px-3.5 py-2 text-sm">닫기</button>
          </div>
        </div>
      )}

      {/* 엑셀 다운로드 - 프로젝트 선택 */}
      {showExportPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" onClick={() => setShowExportPicker(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[380px] rounded-2xl bg-white p-5">
            <h3 className="mb-3.5 text-[15.5px] font-bold">엑셀 다운로드</h3>
            <label className="mb-1 block text-xs text-[#79766D]">프로젝트 선택</label>
            <select value={exportProjectId} onChange={(e) => setExportProjectId(e.target.value)} className={`${inputCls} mb-4`}>
              {scopedProjects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </select>
            <div className="flex gap-2">
              <a href={exportProjectId ? `/api/projects/${exportProjectId}/export` : undefined} className={`${btnPrimary} flex items-center gap-1.5`} onClick={() => setShowExportPicker(false)}>
                <Download size={13} /> 다운로드
              </a>
              <button onClick={() => setShowExportPicker(false)} className={btnDefault}>취소</button>
            </div>
          </div>
        </div>
      )}
      {/* 전체 시스템 로그 (프로젝트/업무 전체 변경 이력) */}
      {logDrawerOpen && (
        <div className="fixed inset-0 z-[60]" onClick={() => setLogDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/25" />
          <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-0 h-full w-[380px] overflow-y-auto border-l border-[#E4E1D6] bg-white p-5">
            <div className="mb-3.5 flex items-center justify-between">
              <h3 className="text-[15px] font-bold">전체 로그</h3>
              <button onClick={() => setLogDrawerOpen(false)}><X size={17} className="text-[#79766D]" /></button>
            </div>
            {logsLoading && <div className="text-xs text-[#A7A399]">불러오는 중...</div>}
            {!logsLoading && systemLogs.length === 0 && <div className="text-xs text-[#A7A399]">기록이 없습니다.</div>}
            {systemLogs.map((l) => (
              <div key={l.id} className="flex gap-2.5 border-t border-[#E4E1D6] py-2.5 first:border-t-0">
                <Bell size={13} className="mt-0.5 flex-shrink-0 text-[#2C56C9]" />
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold">{l.project?.code} · {l.project?.name}</div>
                  <div className="mt-0.5 text-xs text-[#79766D]">{l.change}</div>
                  <div className="mt-0.5 text-[10.5px] text-[#A7A399]">{l.actor_name} · {new Date(l.created_at).toLocaleString("ko-KR")}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
