"use client";

import { useEffect, useState } from "react";

export type Lang = "ko" | "en" | "vi";

// UI 고정 문구만 번역합니다 (사람이 입력하는 이름/프로젝트명/메모 등은 번역하지 않습니다).
const dict = {
  app_subtitle: { ko: "미디어팀 외주 업무 관리", en: "Media Team Outsourcing Management", vi: "Quản lý công việc thuê ngoài đội Media" },
  nav_projects: { ko: "프로젝트 관리", en: "Projects", vi: "Quản lý dự án" },
  nav_contractors: { ko: "외주 작업자 관리", en: "Contractors", vi: "Quản lý cộng tác viên" },
  nav_managers: { ko: "담당자 관리", en: "Managers", vi: "Quản lý phụ trách" },
  role_manager: { ko: "담당자", en: "Manager", vi: "Phụ trách" },
  role_contractor: { ko: "외주 작업자", en: "Contractor", vi: "Cộng tác viên" },
  logout: { ko: "로그아웃", en: "Log out", vi: "Đăng xuất" },

  all_view: { ko: "전체 보기", en: "All", vi: "Tất cả" },
  full_log: { ko: "전체 로그", en: "Full Log", vi: "Nhật ký" },
  edit: { ko: "수정", en: "Edit", vi: "Sửa" },
  new_project: { ko: "새 프로젝트", en: "New Project", vi: "Dự án mới" },
  ready_projects: { ko: "준비 중 프로젝트", en: "Not Started", vi: "Chưa bắt đầu" },
  inprogress_projects: { ko: "진행 중 프로젝트", en: "In Progress", vi: "Đang thực hiện" },
  done_projects: { ko: "완료된 프로젝트", en: "Completed", vi: "Đã hoàn thành" },
  archived_projects: { ko: "삭제된 프로젝트", en: "Deleted", vi: "Đã xóa" },
  all_tasks: { ko: "전체 업무", en: "All Tasks", vi: "Tất cả công việc" },
  my_tasks: { ko: "내 업무 보기", en: "My Tasks", vi: "Công việc của tôi" },
  all_tasks_toggle: { ko: "모든 업무 보기", en: "All Tasks", vi: "Tất cả công việc" },
  project_status: { ko: "프로젝트 현황", en: "Project Status", vi: "Tình trạng dự án" },
  schedule: { ko: "일정 관리", en: "Schedule", vi: "Lịch trình" },

  by_category: { ko: "업무별", en: "By Task", vi: "Theo công việc" },
  by_status: { ko: "진행상황별", en: "By Status", vi: "Theo trạng thái" },
  register_task: { ko: "업무 등록", en: "New Task", vi: "Đăng ký công việc" },
  search_placeholder: { ko: "작업자/담당자 이름 검색", en: "Search contractor/manager name", vi: "Tìm tên cộng tác viên/phụ trách" },
  excel_download: { ko: "엑셀 다운로드", en: "Download Excel", vi: "Tải Excel" },

  save: { ko: "저장", en: "Save", vi: "Lưu" },
  cancel: { ko: "취소", en: "Cancel", vi: "Hủy" },
  close: { ko: "닫기", en: "Close", vi: "Đóng" },
  delete: { ko: "삭제", en: "Delete", vi: "Xóa" },
  submit: { ko: "제출", en: "Submit", vi: "Gửi" },
  confirm: { ko: "확인", en: "Confirm", vi: "Xác nhận" },
  restore: { ko: "복원", en: "Restore", vi: "Khôi phục" },

  task_status_waiting: { ko: "대기중", en: "Waiting", vi: "Chờ" },
  task_status_in_progress: { ko: "작업 중", en: "In Progress", vi: "Đang làm" },
  task_status_reviewing: { ko: "검수 중", en: "Reviewing", vi: "Đang duyệt" },
  task_status_rework_notice: { ko: "재작업 확인 대기", en: "Rework Pending", vi: "Chờ xác nhận sửa" },
  task_status_done: { ko: "완료", en: "Done", vi: "Hoàn thành" },

  project_status_ready: { ko: "준비 중", en: "Not Started", vi: "Chưa bắt đầu" },
  project_status_active: { ko: "작업 중", en: "In Progress", vi: "Đang thực hiện" },
  project_status_reviewing: { ko: "검수 중", en: "Reviewing", vi: "Đang duyệt" },
  project_status_confirmed: { ko: "확인 완료", en: "Confirmed", vi: "Đã xác nhận" },
  project_status_uploaded: { ko: "업로드 완료", en: "Uploaded", vi: "Đã tải lên" },

  task_start: { ko: "업무 시작", en: "Start Task", vi: "Bắt đầu" },
  task_end: { ko: "업무 종료", en: "End Task", vi: "Kết thúc" },
  rework_request: { ko: "재작업 요청", en: "Request Rework", vi: "Yêu cầu sửa lại" },
  review_approve: { ko: "검수 확인", en: "Approve", vi: "Duyệt" },
  handoff: { ko: "다른 작업자에게 인계", en: "Hand off to another", vi: "Chuyển cho người khác" },

  login_title: { ko: "로그인", en: "Log in", vi: "Đăng nhập" },
  email: { ko: "이메일", en: "Email", vi: "Email" },
  password: { ko: "비밀번호", en: "Password", vi: "Mật khẩu" },
  contractors_title: { ko: "외주 작업자 관리", en: "Contractor Management", vi: "Quản lý cộng tác viên" },
  new_contractor: { ko: "새 작업자 등록", en: "New Contractor", vi: "Đăng ký mới" },
  managers_title: { ko: "담당자 관리", en: "Manager Management", vi: "Quản lý phụ trách" },
  new_manager: { ko: "새 담당자 등록", en: "New Manager", vi: "Đăng ký mới" },

  completed_tasks_section: { ko: "완료된 업무", en: "Completed Tasks", vi: "Công việc đã hoàn thành" },
  past_assignments_section: { ko: "참여했던 업무", en: "Past Tasks", vi: "Công việc đã tham gia" },
  archived_tasks_section: { ko: "삭제된 업무", en: "Deleted Tasks", vi: "Công việc đã xóa" },
  start_short: { ko: "시작", en: "Start", vi: "Bắt đầu" },
  end_short: { ko: "종료", en: "End", vi: "Kết thúc" },
  restart_short: { ko: "재시작", en: "Restart", vi: "Bắt đầu lại" },
  reend_short: { ko: "재종료", en: "Re-end", vi: "Kết thúc lại" },
  handed_off: { ko: "인계됨", en: "Handed off", vi: "Đã chuyển giao" },
  all_short: { ko: "전체", en: "All", vi: "Tất cả" },
  work_status: { ko: "작업 상황", en: "Work Status", vi: "Tình trạng công việc" },
  label_pending: { ko: "대기", en: "Waiting", vi: "Chờ" },
  label_working: { ko: "진행중", en: "In Progress", vi: "Đang thực hiện" },
  label_working_short: { ko: "진행", en: "Active", vi: "Đang làm" },
  label_complete: { ko: "완료", en: "Done", vi: "Hoàn thành" },
  sound_check: { ko: "음량 확인", en: "Sound Check", vi: "Kiểm tra âm thanh" },
  upload_check: { ko: "업로드 확인", en: "Upload Check", vi: "Kiểm tra tải lên" },
  qc: { ko: "검수 상태", en: "QC", vi: "QC" },
  pub_label: { ko: "게재", en: "Pub", vi: "Đăng" },
  pub_done: { ko: "완료", en: "Done", vi: "Xong" },
  pub_declined: { ko: "불가", en: "Declined", vi: "Từ chối" },
  pub_not_yet: { ko: "미정", en: "Not yet", vi: "Chưa xác định" },
} as const;

export function taskCountLabel(lang: Lang, n: number) {
  if (lang === "ko") return `업무 ${n}건`;
  if (lang === "vi") return `${n} công việc`;
  return `${n} tasks`;
}

export type DictKey = keyof typeof dict;

export function t(lang: Lang, key: DictKey): string {
  return dict[key][lang];
}

export function useLang(): [Lang, (l: Lang) => void] {
  const [lang, setLangState] = useState<Lang>("ko");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? (localStorage.getItem("taskflow_lang") as Lang | null) : null;
    if (saved === "ko" || saved === "en" || saved === "vi") setLangState(saved);
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    if (typeof window !== "undefined") localStorage.setItem("taskflow_lang", l);
  }

  return [lang, setLang];
}
