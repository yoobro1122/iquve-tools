const wrap = (title: string, bodyHtml: string) => `
<div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #222;">
  <h2 style="font-size: 18px; margin-bottom: 16px;">${title}</h2>
  <div style="font-size: 14px; line-height: 1.6;">${bodyHtml}</div>
  <p style="margin-top: 24px; font-size: 12px; color: #888;">TaskFlow (iQUVE 외주 업무 관리)에서 자동 발송된 메일입니다.</p>
</div>
`;

function taskLine(projectName: string, taskLabel: string) {
  return `<p>프로젝트: <b>${projectName}</b><br/>업무: <b>${taskLabel}</b></p>`;
}

export function taskStartedEmail(projectName: string, taskLabel: string, contractorName: string) {
  return {
    subject: `[업무 시작] ${contractorName}님이 업무를 시작했습니다`,
    html: wrap("업무 시작 알림", `<p><b>${contractorName}</b> 작업자가 업무를 시작했습니다.</p>${taskLine(projectName, taskLabel)}`),
  };
}

export function taskSubmittedEmail(projectName: string, taskLabel: string, contractorName: string, isResubmit: boolean) {
  return {
    subject: isResubmit ? `[재제출] "${taskLabel}" 수정 완료, 검수 요청` : `[검수 요청] "${taskLabel}" 업무가 종료되었습니다`,
    html: wrap(
      isResubmit ? "수정 완료 - 재검수 요청" : "검수 요청 알림",
      `<p><b>${contractorName}</b> 작업자가 ${isResubmit ? "수정을 완료하고 재제출" : "업무를 종료"}했습니다. 검수를 진행해주세요.</p>${taskLine(projectName, taskLabel)}`
    ),
  };
}

export function reviewApprovedEmail(projectName: string, taskLabel: string) {
  return {
    subject: `[검수 완료] "${taskLabel}" 업무가 완료 처리되었습니다`,
    html: wrap("검수 완료", `<p>검수를 통과하여 업무가 완료 처리되었습니다.</p>${taskLine(projectName, taskLabel)}`),
  };
}

export function reworkRequestedEmail(projectName: string, taskLabel: string, message: string) {
  return {
    subject: `[수정 요청] "${taskLabel}" 재작업이 필요합니다`,
    html: wrap(
      "재작업 요청",
      `${taskLine(projectName, taskLabel)}
       <p style="background:#f5f5f5; padding:12px; border-radius:6px;">${message}</p>
       <p>내용을 확인 후 "메시지 확인 완료"를 눌러주세요.</p>`
    ),
  };
}

export function publishDecidedEmail(projectName: string, decision: "confirmed" | "declined", reason?: string) {
  return {
    subject: decision === "confirmed" ? `[게시 완료] "${projectName}" 프로젝트가 게시되었습니다` : `[게시 보류] "${projectName}" 프로젝트 게시가 보류되었습니다`,
    html: wrap(
      decision === "confirmed" ? "게시 완료" : "게시 보류",
      decision === "confirmed"
        ? `<p>프로젝트 <b>${projectName}</b>이(가) 게시 완료 처리되었습니다.</p>`
        : `<p>프로젝트 <b>${projectName}</b> 게시가 보류되었습니다.</p><p style="background:#f5f5f5; padding:12px; border-radius:6px;">${reason || ""}</p>`
    ),
  };
}
