"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Profile } from "@/lib/types";
import Header from "@/app/components/Header";
import { Plus, Pencil, KeyRound, Trash2, Copy, Check, Loader2 } from "lucide-react";

export default function ContractorsPage() {
  const supabase = createClient();
  const [me, setMe] = useState<Profile | null>(null);
  const [contractors, setContractors] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState({ id: "", name: "", specialty: "", note: "", email: "" });
  const [error, setError] = useState("");

  const [credModal, setCredModal] = useState<{ title: string; email: string; password: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    setMe(profile as Profile);

    const res = await fetch("/api/contractors");
    const data = await res.json();
    setContractors(data.items ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

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

      <main className="mx-auto max-w-4xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">외주 작업자 관리</h2>
          <button onClick={openNew} className="flex items-center gap-1.5 rounded-lg bg-[#1F1E1B] px-3.5 py-2 text-sm font-semibold text-white">
            <Plus size={14} /> 새 작업자 등록
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-[#E4E1D6] bg-white">
          <div className="grid grid-cols-[1fr_1.4fr_1.6fr_1.4fr_auto] gap-0 border-b border-[#E4E1D6] px-4 py-2.5 text-[11.5px] font-bold text-[#79766D]">
            <span>이름</span><span>담당 업무</span><span>이메일</span><span>비고</span><span></span>
          </div>
          {contractors.map((c) => (
            <div key={c.id} className="grid grid-cols-[1fr_1.4fr_1.6fr_1.4fr_auto] items-center gap-0 border-b border-[#E4E1D6] px-4 py-3 text-[13px]">
              <span className="font-semibold">{c.name}</span>
              <span className="text-[#79766D]">{c.specialty || "-"}</span>
              <span className="text-[#79766D]">{c.email}</span>
              <span className="text-[#A7A399]">{c.note || "-"}</span>
              <div className="flex gap-1.5">
                <button onClick={() => openEdit(c)} title="수정" className="flex h-7 w-7 items-center justify-center rounded-md border border-[#E4E1D6]"><Pencil size={13} /></button>
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
    </div>
  );
}
