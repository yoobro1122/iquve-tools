"use client";

import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Users, Film, UserCog } from "lucide-react";

export default function Header({ name, role }: { name: string; role: "manager" | "contractor" }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex items-center justify-between border-b border-[#E4E1D6] bg-white px-6 py-3.5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1F1E1B]">
          <Film size={17} color="#fff" />
        </div>
        <div>
          <div className="text-[15px] font-bold leading-tight">TaskFlow <span className="text-[10px] font-normal text-[#A7A399]">v1.06</span></div>
          <div className="text-[11px] text-[#79766D]">미디어팀 외주 업무 관리</div>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        {role === "manager" && (
          <div className="flex rounded-lg bg-[#EEEDE7] p-0.5">
            <button
              onClick={() => router.push("/board")}
              className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold ${pathname === "/board" ? "bg-white" : "text-[#79766D]"}`}
            >
              프로젝트 관리
            </button>
            <button
              onClick={() => router.push("/contractors")}
              className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-[12.5px] font-semibold ${pathname === "/contractors" ? "bg-white" : "text-[#79766D]"}`}
            >
              <Users size={13} /> 외주 작업자 관리
            </button>
            <button
              onClick={() => router.push("/managers")}
              className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-[12.5px] font-semibold ${pathname === "/managers" ? "bg-white" : "text-[#79766D]"}`}
            >
              <UserCog size={13} /> 담당자 관리
            </button>
          </div>
        )}
        <span className="text-[12.5px] text-[#79766D]">{name} ({role === "manager" ? "담당자" : "외주 작업자"})</span>
        <button onClick={handleLogout} className="rounded-lg border border-[#E4E1D6] px-3 py-1.5 text-[12.5px]">
          로그아웃
        </button>
      </div>
    </header>
  );
}
