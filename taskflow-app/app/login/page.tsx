"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.");
      return;
    }
    router.push("/board");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F6F5F0] px-4">
      <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4 rounded-2xl border border-[#E4E1D6] bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-lg font-semibold">TaskFlow</h1>
          <p className="text-sm text-[#79766D]">미디어팀 외주 업무 관리 시스템</p>
        </div>
        <div className="space-y-2">
          <input
            type="email"
            required
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-[#E4E1D6] px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-[#E4E1D6] px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-[#1F1E1B] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "로그인 중..." : "로그인"}
        </button>
        <p className="text-xs text-[#A7A399]">
          계정은 담당자가 미리 생성합니다. 외주 작업자는 등록 시 안내받은 이메일/임시 비밀번호로 로그인해주세요.
        </p>
      </form>
    </div>
  );
}
