"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import Header from "@/app/components/Header";
import {
  Play, Check, X, Plus, ChevronLeft, ChevronRight, ChevronDown,
  FolderPlus, Volume2, UploadCloud, ClipboardCheck, Pencil, Trash2,
  Boxes, Settings, RotateCcw, ClipboardList, Loader2, Link as LinkIcon,
  Search, Download, XCircle,
} from "lucide-react";
import {
  Profile, MajorCategory, Category, Project, Task,
  TASK_STATUS_LABEL, computeProjectStatus, allTasksDone, ddayLabel, workDays,
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
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function simplifiedStatus(full: string) {
  if (full === "준비 중") return "준비 중";
  if (full === "업로드 완료") return "완료";
  if (full === "검수 중" || full === "확인 완료") return "검수 중";
  return "진행 중";
}

export default function BoardPage() {
  const supabase = createClient();
  const [me, setMe] = useState<Profile | null>(null);
  const [majorCategories, setMajorCategories] = useState<MajorCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [contractors, setContractors] = useState<Profile[]>([]);
  const [managers, setManagers] = useState<Profile[]>([]);
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
  const [projectStatusView, setProjectStatusView] = useState(false);
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
  const [newTask, setNewTask] = useState({ category_id: "", episode_id: "", contractor_id: "", manager_id: "", planned_start_date: todayStr(), memo: "" });

  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [editTaskDraft, setEditTaskDraft] = useState({ category_id: "", episode_id: "", contractor_id: "", manager_id: "", memo: "" });

  const [reworkModalTaskId, setReworkModalTaskId] = useState<string | null>(null);
  const [reworkMessage, setReworkMessage] = useState("");

  const [submitModalTaskId, setSubmitModalTaskId] = useState<string | null>(null);
  const [fileLinkDraft, setFileLinkDraft] = useState("");

  const [showExportPicker, setShowExportPicker] = useState(false);
  const [exportProjectId, setExportProjectId] = useState("");

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
      .select("*, project:project_id(*), category:category_id(*), episode:episode_id(*), contractor:contractor_id(*), manager:manager_id(*), rework_notes:task_rework_notes(*)")
      .order("created_at", { ascending: true });
    setTasks((taskData as unknown as Task[]) ?? []);

    if (profile?.role === "manager") {
      const { data: cs } = await supabase.from("profiles").select("*").eq("role", "contractor").order("name");
      setContractors((cs as Profile[]) ?? []);
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
    if (me?.role === "contractor") list = list.filter((t) => t.contractor_id === me.id);
    if (isAllView && searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((t) => t.contractor?.name?.toLowerCase().includes(q) || t.manager?.name?.toLowerCase().includes(q));
    }
    return list;
  }, [episodeFilteredTasks, me, isAllView, searchQuery]);

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

  // ---------------- task actions ----------------
  async function taskStart(t: Task) { if (await api(`/api/tasks/${t.id}/start`, "POST")) load(); }
  function openSubmitModal(t: Task) { setSubmitModalTaskId(t.id); setFileLinkDraft(t.file_link || ""); }
  async function confirmSubmit() {
    if (!fileLinkDraft.trim()) { alert("작업 파일 링크를 입력해주세요."); return; }
    if (await api(`/api/tasks/${submitModalTaskId}/submit`, "POST", { file_link: fileLinkDraft.trim() })) {
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

  function openEditTask(t: Task) {
    setEditTaskId(t.id);
    setEditTaskDraft({ category_id: t.category_id, episode_id: t.episode_id ?? "", contractor_id: t.contractor_id, manager_id: t.manager_id ?? "", memo: t.memo ?? "" });
  }
  async function saveEditTask() {
    if (await api(`/api/tasks/${editTaskId}`, "PATCH", editTaskDraft)) { setEditTaskId(null); load(); }
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
    if (await api("/api/tasks", "POST", { project_id: selectedProject!.id, ...newTask })) { setShowNewTask(false); load(); }
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
    const isMine = me!.role === "contractor" && t.contractor_id === me!.id;
    const isManagerView = me!.role === "manager";
    const notes = t.rework_notes ?? [];

    return (
      <div className="rounded-xl border border-[#E4E1D6] bg-white p-3.5" style={{ opacity: projectArchived ? 0.6 : 1 }}>
        <div className="mb-1.5 flex items-start justify-between">
          <div className="text-[10.5px] text-[#A7A399]">{proj.code} / {t.code} / {proj.name}</div>
          {isManagerView && !projectArchived && (
            <button onClick={() => openEditTask(t)} title="업무 수정"><Pencil size={12} className="text-[#79766D]" /></button>
          )}
        </div>
        <div className="mb-1.5 text-[15px] font-bold">{episodeLabel(t)}</div>
        <div className="mb-2 text-[12.5px] text-[#79766D]">
          {contractorName(t)} <span className="text-[#A7A399]">(담당: {managerName(t)})</span> · <span className={`font-semibold ${TASK_STATUS_COLOR[t.status]}`}>{TASK_STATUS_LABEL[t.status]}</span>
        </div>

        {t.memo && (
          <div className="mb-2 rounded-lg bg-[#F6F5F0] p-2 text-xs text-[#79766D]"><b>메모</b> {t.memo}</div>
        )}

        {t.file_link && (
          <a href={t.file_link} target="_blank" rel="noreferrer" className="mb-2 flex items-center gap-1 text-xs text-[#2C56C9] underline">
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
          <span>{t.start_date ? fmtDate(t.start_date) : "\u00A0"}</span>
          <span>{t.completed_date ? fmtDate(t.completed_date) : "\u00A0"}</span>
        </div>

        {!projectArchived && isMine && t.status === "waiting" && (
          <button onClick={() => taskStart(t)} className={`${btnPrimary} flex w-full items-center justify-center gap-1.5`}><Play size={13} /> 업무 시작</button>
        )}
        {!projectArchived && isMine && t.status === "in_progress" && (
          <button onClick={() => openSubmitModal(t)} className={`${btnPrimary} flex w-full items-center justify-center gap-1.5`}><Check size={13} /> 업무 종료</button>
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

        {!projectArchived && isManagerView && t.status === "reviewing" && (
          <div className="flex gap-2">
            <button onClick={() => reviewApprove(t)} className={`${btnSuccess} flex items-center gap-1`}><Check size={13} /> 검수 확인</button>
            <button onClick={() => openReworkModal(t)} className={`${btnDanger} flex items-center gap-1`}><X size={13} /> 재작업 요청</button>
          </div>
        )}
        {!projectArchived && isManagerView && t.status === "rework_notice" && (
          <button onClick={() => openReworkModal(t)} className={`${btnDefault} flex items-center gap-1`}><Pencil size={13} /> 메시지 수정</button>
        )}
        {!projectArchived && isManagerView && ["waiting", "in_progress"].includes(t.status) && (
          <div className="text-xs text-[#A7A399]">작업자 진행을 기다리는 중입니다.</div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F6F5F0] text-[#1F1E1B]">
      <Header name={me.name} role={me.role} />

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
        <button onClick={() => setMajorCategoryId("ALL_MC")} className={`px-5 py-3 text-[13.5px] font-bold ${isAllMc ? "border-b-2 border-[#2C56C9] text-[#2C56C9]" : "border-b-2 border-transparent text-[#79766D]"}`}>전체 보기</button>
        {majorCategories.map((mc) => (
          <button key={mc.id} onClick={() => setMajorCategoryId(mc.id)} className={`px-5 py-3 text-[13.5px] font-bold ${majorCategoryId === mc.id ? "border-b-2 border-[#2C56C9] text-[#2C56C9]" : "border-b-2 border-transparent text-[#79766D]"}`}>{mc.label}</button>
        ))}
        {me.role === "manager" && (
          <button onClick={() => setShowMcManage(true)} className="ml-auto flex items-center gap-1.5 px-2.5 py-2 text-[12.5px] font-semibold text-[#79766D]"><Settings size={13} /> 수정</button>
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
            { key: "ready", label: "준비 중 프로젝트" },
            { key: "inprogress", label: "진행 중 프로젝트" },
            { key: "done", label: "완료된 프로젝트" },
            { key: "archived", label: "삭제된 프로젝트" },
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
                    <button onClick={() => { setSelectedProjectId(p.id); setSelectedEpisodeId("ALL"); setProjectStatusView(false); }} className={`min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left ${active ? "bg-[#E8EDFB]" : ""}`} style={{ opacity: p.archived ? 0.55 : 1 }}>
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
                  <button key={p.id} onClick={() => { setSelectedProjectId(p.id); setSelectedEpisodeId("ALL"); setProjectStatusView(false); }} title={`${p.code} · ${p.name}`} className={`mx-auto mb-1.5 flex h-9 w-9 items-center justify-center rounded-lg text-[10.5px] font-bold ${active ? "bg-[#E8EDFB] text-[#2C56C9]" : "text-[#79766D]"}`} style={{ opacity: p.archived ? 0.55 : 1 }}>
                    {p.code.slice(0, 4)}
                  </button>
                );
              })}
            </div>
          ))}

          <div className="mt-4 border-t border-[#E4E1D6] pt-3.5">
            <button onClick={() => { setSelectedProjectId("ALL"); setProjectStatusView(false); }} className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-bold ${sidebarOpen ? "justify-start" : "justify-center"} ${isAllView && !projectStatusView ? "bg-[#E8EDFB] text-[#2C56C9]" : ""}`}>
              <Boxes size={14} />{sidebarOpen && " 전체 업무"}
            </button>
            <button onClick={() => setProjectStatusView(true)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-bold ${sidebarOpen ? "justify-start" : "justify-center"} ${projectStatusView ? "bg-[#E8EDFB] text-[#2C56C9]" : ""}`}>
              <ClipboardList size={14} />{sidebarOpen && " 프로젝트 현황"}
            </button>
          </div>
        </aside>

        <main className="flex-1 overflow-x-auto p-6">
          {projectStatusView ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">프로젝트 현황</h2>
                {me.role === "manager" && (
                  <button onClick={() => { setExportProjectId(scopedProjects[0]?.id ?? ""); setShowExportPicker(true); }} className={`${btnDefault} flex items-center gap-1.5`}>
                    <Download size={14} /> 엑셀 다운로드
                  </button>
                )}
              </div>
              <div className="overflow-hidden rounded-xl border border-[#E4E1D6] bg-white">
                <div className="grid grid-cols-[1.4fr_0.9fr_0.9fr_0.9fr_0.9fr_0.9fr_1.1fr] border-b border-[#E4E1D6] px-3.5 py-2.5 text-[11px] font-bold text-[#79766D]">
                  <span>프로젝트명</span><span>진행 상태</span><span>등록일</span><span>업무 시작일</span><span>완료일</span><span>게재 상태</span><span>비고</span>
                </div>
                {scopedProjects.map((p) => {
                  const full = computeProjectStatus(p, tasks);
                  const simple = simplifiedStatus(full);
                  const projTasks = tasks.filter((t) => t.project_id === p.id && !t.archived);
                  const started = projTasks.filter((t) => t.start_date).map((t) => t.start_date!).sort()[0];
                  const isExpanded = !!expandedStatusRows[p.id];
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
                          <div className="grid grid-cols-[1fr_1fr_1fr_1fr_0.8fr_0.8fr_0.7fr] gap-0 border-b border-[#E4E1D6] py-1.5 text-[10.5px] font-bold text-[#A7A399]">
                            <span>에피소드</span><span>업무</span><span>외주 작업자</span><span>담당자</span><span>시작일</span><span>종료일</span><span>작업일수</span>
                          </div>
                          {projTasks.map((t) => {
                            const days = workDays(t.start_date, t.completed_date);
                            return (
                              <div key={t.id} className="grid grid-cols-[1fr_1fr_1fr_1fr_0.8fr_0.8fr_0.7fr] gap-0 border-b border-[#EEEDE7] py-1.5 text-[11.5px] last:border-b-0">
                                <span>{episodeLabel(t)}</span>
                                <span className="text-[#79766D]">{t.category?.label ?? "-"}</span>
                                <span>{contractorName(t)}</span>
                                <span>{managerName(t)}</span>
                                <span className="text-[#79766D]">{t.start_date ? fmtDate(t.start_date) : "-"}</span>
                                <span className="text-[#79766D]">{t.completed_date ? fmtDate(t.completed_date) : "-"}</span>
                                <span className="text-[#79766D]">{days ?? "-"}</span>
                              </div>
                            );
                          })}
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
                      <div className="mb-0.5 text-[11px] text-[#A7A399]">{selectedProject!.code} / 업무 {rawScopeTasks.length}건 / {ddayLabel(selectedProject!)}</div>
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
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${PROJECT_STATUS_COLOR[computeProjectStatus(selectedProject!, tasks)]}`}>{computeProjectStatus(selectedProject!, tasks)}</span>
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">음량 {selectedProject!.volume_check}</span>
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-600">업로드 {selectedProject!.upload_status}</span>
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">검수 {selectedProject!.review_status}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {!isAllView && !selectedProject!.archived && (
                <div className="mb-3.5 flex flex-wrap items-center gap-1.5">
                  <button onClick={() => setSelectedEpisodeId("ALL")} className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${selectedEpisodeId === "ALL" ? "bg-[#1F1E1B] text-white" : "bg-[#EEEDE7] text-[#79766D]"}`}>전체</button>
                  {(selectedProject!.episodes ?? []).map((ep) => (
                    <button key={ep.id} onClick={() => setSelectedEpisodeId(ep.id)} className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${selectedEpisodeId === ep.id ? "bg-[#1F1E1B] text-white" : "bg-[#EEEDE7] text-[#79766D]"}`}>{ep.label}</button>
                  ))}
                  {me.role === "manager" && (
                    <button onClick={() => setShowEpisodeManage(true)} className="ml-1 flex items-center gap-1 text-[12px] font-semibold text-[#2C56C9]"><Settings size={12} /> 수정</button>
                  )}
                </div>
              )}

              {!isAllView && computeProjectStatus(selectedProject!, tasks) === "업로드 보류" && selectedProject!.decline_reason && (
                <div className="mb-3.5 text-xs text-red-600">게시 불가 사유: {selectedProject!.decline_reason}</div>
              )}

              {!isAllView && !selectedProject!.archived && me.role === "manager" && computeProjectStatus(selectedProject!, tasks) === "확인 완료" && (
                <div className="mb-5 flex items-center gap-2.5 rounded-xl bg-violet-50 px-3.5 py-2.5 text-sm">
                  <span className="font-semibold text-violet-700">프로젝트가 게시 되었나요?</span>
                  <div className="ml-auto flex gap-2">
                    <button onClick={handlePublishConfirm} className={`${btnSuccess} flex items-center gap-1.5`}><UploadCloud size={13} /> 게시 확인</button>
                    <button onClick={openDeclineModal} className={`${btnDanger} flex items-center gap-1.5`}><X size={13} /> 게시 불가</button>
                  </div>
                </div>
              )}

              <div className="mb-3.5 flex items-center justify-between gap-3">
                {isAllView ? (
                  <div className="relative flex-1 max-w-xs">
                    <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#A7A399]" />
                    <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="작업자/담당자 이름 검색" className="w-full rounded-lg border border-[#E4E1D6] py-2 pl-8 pr-3 text-[13px]" />
                  </div>
                ) : <div />}
                <div className="flex items-center gap-2">
                  {!isAllView && !selectedProject!.archived && me.role === "manager" && (
                    <button onClick={() => { setNewTask({ category_id: categories[0]?.id ?? "", episode_id: selectedEpisodeId !== "ALL" ? selectedEpisodeId : (selectedProject!.episodes?.[0]?.id ?? ""), contractor_id: contractors[0]?.id ?? "", manager_id: me.id, planned_start_date: todayStr(), memo: "" }); setShowNewTask(true); }} className={`${btnPrimary} flex items-center gap-1.5`}>
                      <Plus size={14} /> 업무 등록
                    </button>
                  )}
                  <div className="flex rounded-lg bg-[#EEEDE7] p-0.5">
                    <button onClick={() => setViewMode("category")} className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold ${viewMode === "category" ? "bg-white" : "text-[#79766D]"}`}>업무별</button>
                    <button onClick={() => setViewMode("status")} className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold ${viewMode === "status" ? "bg-white" : "text-[#79766D]"}`}>진행상황별</button>
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

              {archivedTasksInScope.length > 0 && (
                <div className="mt-7">
                  <button onClick={() => setShowArchivedTasks((v) => !v)} className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#79766D]">
                    <ChevronDown size={13} style={{ transform: showArchivedTasks ? "rotate(0deg)" : "rotate(-90deg)" }} />
                    삭제된 업무 · {archivedTasksInScope.length}
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
                  {["Checking", "Done", "Not yet"].map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs text-[#79766D]"><UploadCloud size={13} /> 프로젝트 업로드</label>
                <select value={draftStatus.upload_status} onChange={(e) => setDraftStatus({ ...draftStatus, upload_status: e.target.value })} className={inputCls}>
                  <option value="Not yet">Not yet</option>
                  <option value="Complete" disabled={!projectDone}>Complete{!projectDone ? " (모든 업무 완료 필요)" : ""}</option>
                </select>
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs text-[#79766D]"><ClipboardCheck size={13} /> 검수 상태</label>
                <select value={draftStatus.review_status} onChange={(e) => setDraftStatus({ ...draftStatus, review_status: e.target.value })} className={inputCls}>
                  <option value="Processing">Processing</option>
                  <option value="Revision(Kor)">Revision(Kor)</option>
                  <option value="R-Complete">R-Complete</option>
                  <option value="Complete(Kor)" disabled={!projectDone}>Complete(Kor){!projectDone ? " (모든 업무 완료 필요)" : ""}</option>
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
            <h3 className="mb-3 text-[15.5px] font-bold">게시 불가 사유가 무엇인가요?</h3>
            <textarea rows={4} value={declineReasonDraft} onChange={(e) => setDeclineReasonDraft(e.target.value)} placeholder="게시가 불가한 이유를 입력해주세요." className={`${inputCls} mb-3 resize-y`} />
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
            <h3 className="mb-3 text-[15.5px] font-bold">게시 불가 사유</h3>
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
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <span key={c.id} className="flex items-center gap-1 rounded-full bg-[#EEEDE7] py-0.5 pl-2.5 pr-1.5 text-[11px]">
                    {c.label}
                    <Pencil size={11} className="cursor-pointer" onClick={() => renameCategory(c.id, c.label)} />
                    <Trash2 size={11} className="cursor-pointer text-red-600" onClick={() => deleteCategory(c.id)} />
                  </span>
                ))}
              </div>
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-xs text-[#79766D]">외주 작업자 (등록된 작업자만 선택 가능)</label>
              <select value={newTask.contractor_id} onChange={(e) => setNewTask({ ...newTask, contractor_id: e.target.value })} className={inputCls}>
                {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-xs text-[#79766D]">담당자</label>
              <select value={newTask.manager_id} onChange={(e) => setNewTask({ ...newTask, manager_id: e.target.value })} className={inputCls}>
                {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-xs text-[#79766D]">업무 시작일 (오늘 이후 날짜로 바꾸면 그날 00시에 등록 알림 메일 발송)</label>
              <input type="date" value={newTask.planned_start_date} onChange={(e) => setNewTask({ ...newTask, planned_start_date: e.target.value })} className={inputCls} />
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
              <label className="mb-1 block text-xs text-[#79766D]">외주 작업자</label>
              <select value={editTaskDraft.contractor_id} onChange={(e) => setEditTaskDraft({ ...editTaskDraft, contractor_id: e.target.value })} className={inputCls}>
                {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-[#79766D]">담당자</label>
              <select value={editTaskDraft.manager_id} onChange={(e) => setEditTaskDraft({ ...editTaskDraft, manager_id: e.target.value })} className={inputCls}>
                {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
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
    </div>
  );
}
