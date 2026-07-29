"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Profile, avgDurationLabel, TASK_STATUS_LABEL } from "@/lib/types";
import Header from "@/app/components/Header";
import { Plus, Pencil, KeyRound, Trash2, Copy, Check, Loader2, Sparkles } from "lucide-react";

interface ContractorWithStats extends Profile {
  stats: { totalDone: number; avgDurationMinutes: number | null; avgRating: number | null };
}

function fmtDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

const TASK_STATUS_COLOR: Record<string, string> = {
  waiting: "text-gray-400", in_progress: "text-blue-600", reviewing: "text-amber-700",
  rework_notice: "text-red-600", done: "text-emerald-700",
};

export default function ContractorsPage() {
  const supabase = createClient();
  const [me, setMe] = useState<Profile | null>(null);
  const [contractors, setContractors] = useState<ContractorWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState({ id: "", name: "", specialty: "", note: "", email: "" });
  const [error, setError] = useState("");

  const [credModal, setCredModal] = useState<{ title: string; email: string; password: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [tasksModal, setTasksModal] = useState<{ contractor: ContractorWithStats; tasks: any[] } | null>(null);
  const [tasksModalLoading, setTasksModalLoading] = useState(false);

  const [aiServices, setAiServices] = useState<{ id: string; label: string }[]>([]);
  const [aiModalContractor, setAiModalContractor] = useState<ContractorWithStats | null>(null);
  const [aiAccounts, setAiAccounts] = useState<any[]>([]);
  const [aiAccountsLoading, setAiAccountsLoading] = useState(false);
  const [newAiServiceId, setNewAiServiceId] = useState("");
  const [newAiAccountLabel, setNewAiAccountLabel] = useState("");
  const [newAiCredit, setNewAiCredit] = useState("0");
  const [newServiceLabel, setNewServiceLabel] = useState("");

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    setMe(profile as Profile);

    const [res, aiRes] = await Promise.all([fetch("/api/contractors"), fetch("/api/ai-services")]);
    const data = await res.json();
    setContractors(data.items ?? []);
    const aiData = await aiRes.json();
    setAiServices(aiData.items ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function openAiModal(c: ContractorWithStats) {
    setAiModalContractor(c);
    setAiAccountsLoading(true);
    setNewAiServiceId(aiServices[0]?.id ?? "");
    setNewAiAccountLabel("");
    setNewAiCredit("0");
    const res = await fetch(`/api/contractors/${c.id}/ai-accounts`);
    const data = await res.json();
    setAiAccounts(data.items ?? []);
    setAiAccountsLoading(false);
  }
  async function addAiService() {
    if (!newServiceLabel.trim()) return;
    const res = await fetch("/api/ai-services", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: newServiceLabel.trim() }) });
    const data = await res.json();
    if (res.ok) {
      setAiServices((s) => [...s, data.item]);
      setNewAiServiceId(data.item.id);
      setNewServiceLabel("");
    }
  }
  async function addAiAccount() {
    if (!aiModalContractor || !newAiServiceId) return;
    const res = await fetch(`/api/contractors/${aiModalContractor.id}/ai-accounts`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ai_service_id: newAiServiceId, account_label: newAiAccountLabel, remaining_credit: Number(newAiCredit) || 0 }),
    });
    const data = await res.json();
    if (res.ok) {
      setAiAccounts((a) => [data.item, ...a]);
      setNewAiAccountLabel("");
      setNewAiCredit("0");
    } else {
      alert(data.error);
    }
  }
  async function updateAiAccountCredit(id: string, credit: number) {
    const res = await fetch(`/api/ai-accounts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ remaining_credit: credit }) });
    const data = await res.json();
    if (res.ok) setAiAccounts((a) => a.map((x) => (x.id === id ? data.item : x)));
  }
  async function deleteAiAccount(id: string) {
    if (!confirm("이 AI 계정을 삭제할까요?")) return;
    const res = await fetch(`/api/ai-accounts/${id}`, { method: "DELETE" });
    if (res.ok) setAiAccounts((a) => a.filter((x) => x.id !== id));
  }

  function openNew() {
    setDraft({ id: "", name: "", specialty: "", note: "", email: "" });
    setError("");
    setFormOpen(true);
  }
  function openEdit(c: Profile) {
    setDraft({ id: c.id, name: c.name, specialty: c.specialty, note: c.note, email: c.email });
    setError("");
    setFormOpen(true);
  }

  async function openTasksModal(c: ContractorWithStats) {
    setTasksModal({ contractor: c, tasks: [] });
    setTasksModalLoading(true);
    const res = await fetch(`/api/contractors/${c.id}/tasks`);
    const data = await res.json();
    setTasksModal({ contractor: c, tasks: data.items ?? [] });
    setTasksModalLoading(false);
  }

  async function copy(text: string, field: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      // 클립보드 접근이 막힌 환경 - 사용자가 직접 드래그해서 복사할 수 있도록 안내만 유지
    }
  }

  async function save() {
    setBusy(true);
    try {
      if (draft.id) {
        const res = await fetch(`/api/contractors/${draft.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: draft.name, specialty: draft.specialty, note: draft.note }),
        });
        if (!res.ok) { setError((await res.json()).error); return; }
        setFormOpen(false);
      } else {
        const res = await fetch("/api/contractors", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error); return; }
        setFormOpen(false);
        setCredModal({ title: "작업자 계정이 생성되었습니다", email: draft.email, password: data.tempPassword });
      }
      load();
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(c: Profile) {
    setBusy(true);
    try {
      const res = await fetch(`/api/contractors/${c.id}/reset-password`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { alert(data.error); return; }
      setCredModal({ title: `${c.name}님의 비밀번호가 초기화되었습니다`, email: c.email, password: data.tempPassword });
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: Profile) {
    if (!confirm(`${c.name}님을 삭제할까요? 담당 업무가 남아있으면 삭제되지 않습니다.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/contractors/${c.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { alert(data.error); return; }
      load();
    } finally {
      setBusy(false);
    }
  }

  if (loading || !me) return <div className="p-6 text-sm text-[#79766D]">불러오는 중...</div>;

  return (
    <div>
      <Header name={me.name} role={me.role} />

      {busy && (
        <div className="fixed left-1/2 top-4 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#1F1E1B] px-4 py-2 text-xs font-semibold text-white shadow-lg">
          <Loader2 size={14} className="animate-spin" /> 처리 중...
        </div>
      )}

      <main className="mx-auto max-w-5xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">외주 작업자 관리</h2>
          <button onClick={openNew} className="flex items-center gap-1.5 rounded-lg bg-[#1F1E1B] px-3.5 py-2 text-sm font-semibold text-white">
            <Plus size={14} /> 새 작업자 등록
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-[#E4E1D6] bg-white">
          <div className="grid grid-cols-[1fr_1.2fr_1.5fr_1fr_0.8fr_1fr_0.8fr_150px] gap-0 border-b border-[#E4E1D6] px-4 py-2.5 text-[11.5px] font-bold text-[#79766D]">
            <span>이름</span><span>담당 업무</span><span>이메일</span><span>비고</span><span>총 업무</span><span>평균 작업시간</span><span>평균 평점</span><span>관리</span>
          </div>
          {contractors.map((c) => (
            <div key={c.id} className="grid grid-cols-[1fr_1.2fr_1.5fr_1fr_0.8fr_1fr_0.8fr_150px] items-center gap-0 border-b border-[#E4E1D6] px-4 py-3 text-[13px]">
              <button onClick={() => openTasksModal(c)} className="text-left font-semibold text-[#2C56C9] underline-offset-2 hover:underline">{c.name}</button>
              <span className="text-[#79766D]">{c.specialty || "-"}</span>
              <span className="text-[#79766D]">{c.email}</span>
              <span className="text-[#A7A399]">{c.note || "-"}</span>
              <span className="text-[#79766D]">{c.stats.totalDone}건</span>
              <span className="text-[#79766D]">{avgDurationLabel(c.stats.avgDurationMinutes)}</span>
              <span className="text-[#79766D]">{c.stats.avgRating != null ? `${c.stats.avgRating.toFixed(1)}점` : "-"}</span>
              <div className="flex gap-1.5">
                <button onClick={() => openEdit(c)} title="수정" className="flex h-7 w-7 items-center justify-center rounded-md border border-[#E4E1D6]"><Pencil size={13} /></button>
                <button onClick={() => openAiModal(c)} title="AI 계정 관리" className="flex h-7 w-7 items-center justify-center rounded-md border border-[#E4E1D6]"><Sparkles size={13} /></button>
                <button onClick={() => resetPassword(c)} title="비밀번호 초기화" className="flex h-7 w-7 items-center justify-center rounded-md border border-[#E4E1D6]"><KeyRound size={13} /></button>
                <button onClick={() => remove(c)} title="삭제" className="flex h-7 w-7 items-center justify-center rounded-md border border-[#E4E1D6] text-red-600"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
          {contractors.length === 0 && <div className="p-6 text-center text-sm text-[#A7A399]">등록된 작업자가 없습니다.</div>}
        </div>
      </main>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" onClick={() => setFormOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[380px] rounded-2xl bg-white p-5">
            <h3 className="mb-3.5 text-[15.5px] font-bold">{draft.id ? "작업자 정보 수정" : "새 작업자 등록"}</h3>
            <div className="space-y-2.5">
              <div>
                <label className="mb-1 block text-xs text-[#79766D]">이름</label>
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-full rounded-lg border border-[#E4E1D6] px-2.5 py-2 text-[13.5px]" />
              </div>
              {!draft.id && (
                <div>
                  <label className="mb-1 block text-xs text-[#79766D]">이메일 (로그인 계정)</label>
                  <input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className="w-full rounded-lg border border-[#E4E1D6] px-2.5 py-2 text-[13.5px]" />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs text-[#79766D]">담당 업무</label>
                <input value={draft.specialty} onChange={(e) => setDraft({ ...draft, specialty: e.target.value })} placeholder="예: 일러스트, 리디자인" className="w-full rounded-lg border border-[#E4E1D6] px-2.5 py-2 text-[13.5px]" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#79766D]">비고</label>
                <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} className="w-full rounded-lg border border-[#E4E1D6] px-2.5 py-2 text-[13.5px]" />
              </div>
              {error && <div className="text-xs text-red-600">{error}</div>}
              <div className="flex gap-2 pt-1">
                <button onClick={save} disabled={busy} className="rounded-lg bg-[#1F1E1B] px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50">저장</button>
                <button onClick={() => setFormOpen(false)} className="rounded-lg border border-[#E4E1D6] px-3.5 py-2 text-sm">취소</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 계정 생성 / 비밀번호 초기화 결과 - 복사 가능한 모달 */}
      {credModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" onClick={() => setCredModal(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[400px] rounded-2xl bg-white p-5">
            <h3 className="mb-1 text-[15.5px] font-bold">{credModal.title}</h3>
            <p className="mb-4 text-xs text-[#A7A399]">이 정보를 외주 작업자에게 전달해주세요. 처음 로그인하면 비밀번호를 직접 변경하도록 안내됩니다.</p>

            <label className="mb-1 block text-xs text-[#79766D]">이메일</label>
            <div className="mb-3 flex items-center gap-2">
              <div className="flex-1 rounded-lg border border-[#E4E1D6] bg-[#F6F5F0] px-2.5 py-2 text-[13.5px]">{credModal.email}</div>
              <button onClick={() => copy(credModal.email, "email")} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-[#E4E1D6]" title="이메일 복사">
                {copiedField === "email" ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              </button>
            </div>

            <label className="mb-1 block text-xs text-[#79766D]">임시 비밀번호</label>
            <div className="mb-4 flex items-center gap-2">
              <div className="flex-1 rounded-lg border border-[#E4E1D6] bg-[#F6F5F0] px-2.5 py-2 font-mono text-[13.5px]">{credModal.password}</div>
              <button onClick={() => copy(credModal.password, "password")} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-[#E4E1D6]" title="비밀번호 복사">
                {copiedField === "password" ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => copy(`이메일: ${credModal.email}\n임시 비밀번호: ${credModal.password}`, "both")}
                className="flex items-center gap-1.5 rounded-lg border border-[#E4E1D6] px-3.5 py-2 text-sm"
              >
                {copiedField === "both" ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />} 둘 다 복사
              </button>
              <button onClick={() => setCredModal(null)} className="ml-auto rounded-lg bg-[#1F1E1B] px-3.5 py-2 text-sm font-semibold text-white">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 작업자별 전체 업무 열람 */}
      {tasksModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" onClick={() => setTasksModal(null)}>
          <div onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-[520px] overflow-y-auto rounded-2xl bg-white p-5">
            <h3 className="mb-3.5 text-[15.5px] font-bold">{tasksModal.contractor.name}님의 업무</h3>
            {tasksModalLoading && <div className="text-xs text-[#A7A399]">불러오는 중...</div>}
            {!tasksModalLoading && tasksModal.tasks.length === 0 && (
              <div className="text-xs text-[#A7A399]">배정된 업무가 없습니다.</div>
            )}
            {!tasksModalLoading && [
              { key: "waiting", label: "준비 중" },
              { key: "active", label: "진행 중" },
              { key: "done", label: "완료" },
            ].map((group) => {
              const items = tasksModal.tasks.filter((t) =>
                group.key === "waiting" ? t.status === "waiting"
                : group.key === "done" ? t.status === "done"
                : ["in_progress", "reviewing", "rework_notice"].includes(t.status)
              );
              if (items.length === 0) return null;
              return (
                <div key={group.key} className="mb-4">
                  <div className="mb-1.5 text-[12px] font-bold text-[#79766D]">{group.label} · {items.length}건</div>
                  <div className="flex flex-col gap-1.5">
                    {items.map((t) => (
                      <div key={t.id} className="rounded-lg border border-[#E4E1D6] px-3 py-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[13px] font-semibold">{t.project?.code} · {t.project?.name}</span>
                          <span className={`text-[11px] font-bold ${(TASK_STATUS_COLOR as any)[t.status]}`}>{(TASK_STATUS_LABEL as any)[t.status]}</span>
                        </div>
                        <div className="mt-0.5 text-[12px] text-[#79766D]">{t.episode?.label ?? "적용 안함"} · {t.category?.label ?? "미지정"}</div>
                        <div className="mt-1 flex justify-between text-[11px] text-[#A7A399]">
                          <span>담당: {t.manager?.name ?? "-"}</span>
                          <span>{(() => { const cur = [...(t.assignments ?? [])].sort((a: any, b: any) => a.created_at.localeCompare(b.created_at)).slice(-1)[0]; return cur?.ended_at ? fmtDate(cur.ended_at) : cur?.started_at ? fmtDate(cur.started_at) : fmtDate(t.planned_start_date); })()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <button onClick={() => setTasksModal(null)} className="mt-1 rounded-lg border border-[#E4E1D6] px-3.5 py-2 text-sm">닫기</button>
          </div>
        </div>
      )}

      {/* AI 서비스 계정 / 크레딧 관리 */}
      {aiModalContractor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" onClick={() => setAiModalContractor(null)}>
          <div onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-[460px] overflow-y-auto rounded-2xl bg-white p-5">
            <h3 className="mb-3.5 text-[15.5px] font-bold">{aiModalContractor.name}님의 AI 서비스 계정</h3>

            {aiAccountsLoading && <div className="text-xs text-[#A7A399]">불러오는 중...</div>}
            {!aiAccountsLoading && (
              <div className="mb-4 flex flex-col gap-2">
                {aiAccounts.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 rounded-lg border border-[#E4E1D6] px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold">{a.ai_service?.label}{a.account_label ? ` · ${a.account_label}` : ""}</div>
                      <div className="text-[11px] text-[#A7A399]">잔여 크레딧</div>
                    </div>
                    <input
                      type="number"
                      defaultValue={a.remaining_credit}
                      onBlur={(e) => updateAiAccountCredit(a.id, Number(e.target.value) || 0)}
                      className={`w-24 rounded-lg border px-2 py-1.5 text-right text-[13px] ${Number(a.remaining_credit) <= 0 ? "border-red-400 text-red-600" : "border-[#E4E1D6]"}`}
                    />
                    <button onClick={() => deleteAiAccount(a.id)} className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-[#E4E1D6] text-red-600"><Trash2 size={13} /></button>
                  </div>
                ))}
                {aiAccounts.length === 0 && <div className="text-xs text-[#A7A399]">등록된 AI 계정이 없습니다.</div>}
              </div>
            )}

            <div className="rounded-lg border border-dashed border-[#E4E1D6] p-3">
              <div className="mb-2 text-[12px] font-bold text-[#79766D]">새 AI 계정 추가</div>
              <div className="mb-2 flex gap-1.5">
                <select value={newAiServiceId} onChange={(e) => setNewAiServiceId(e.target.value)} className="flex-1 rounded-lg border border-[#E4E1D6] px-2.5 py-2 text-[13px]">
                  {aiServices.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div className="mb-2 flex gap-1.5">
                <input placeholder="새 AI 서비스 추가" value={newServiceLabel} onChange={(e) => setNewServiceLabel(e.target.value)} className="flex-1 rounded-lg border border-[#E4E1D6] px-2.5 py-2 text-[13px]" />
                <button onClick={addAiService} className="rounded-lg border border-[#E4E1D6] px-3 text-sm">+</button>
              </div>
              <input placeholder="계정 구분 (선택, 예: 두번째 계정)" value={newAiAccountLabel} onChange={(e) => setNewAiAccountLabel(e.target.value)} className="mb-2 w-full rounded-lg border border-[#E4E1D6] px-2.5 py-2 text-[13px]" />
              <div className="flex gap-1.5">
                <input type="number" placeholder="초기 잔여 크레딧" value={newAiCredit} onChange={(e) => setNewAiCredit(e.target.value)} className="flex-1 rounded-lg border border-[#E4E1D6] px-2.5 py-2 text-[13px]" />
                <button onClick={addAiAccount} className="rounded-lg bg-[#1F1E1B] px-3.5 py-2 text-sm font-semibold text-white">추가</button>
              </div>
            </div>

            <button onClick={() => setAiModalContractor(null)} className="mt-3.5 rounded-lg border border-[#E4E1D6] px-3.5 py-2 text-sm">닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}
