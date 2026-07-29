const wrap = (title: string, bodyHtml: string) => `
<div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #222;">
  <h2 style="font-size: 18px; margin-bottom: 16px;">${title}</h2>
  <div style="font-size: 14px; line-height: 1.6;">${bodyHtml}</div>
  <p style="margin-top: 24px; font-size: 12px; color: #888;">TaskFlow (미디어팀 외주 업무 관리)에서 자동 발송된 메일입니다.</p>
</div>
`;

function taskLine(projectName: string, taskLabel: string) {
  return `<p>프로젝트: <b>${projectName}</b><br/>업무: <b>${taskLabel}</b></p>`;
}
function memoLine(memo?: string) {
  if (!memo?.trim()) return "";
  return `<p style="background:#f5f5f5; padding:12px; border-radius:6px;"><b>메모</b><br/>${memo}</p>`;
}

export function taskAssignedEmail(projectName: string, taskLabel: string, contractorName: string, memo?: string) {
  return {
    subject: `[업무 등록] 새 업무가 배정되었습니다`,
    html: wrap(
      "업무 등록 알림",
      `<p><b>${contractorName}</b>님에게 새 업무가 배정되었습니다.</p>${taskLine(projectName, taskLabel)}${memoLine(memo)}`
    ),
  };
}

export function taskReassignedEmail(projectName: string, taskLabel: string, contractorName: string, memo?: string) {
  return {
    subject: `[업무 재배정] 업무가 배정되었습니다`,
    html: wrap(
      "업무 재배정 알림",
      `<p><b>${contractorName}</b>님에게 아래 업무가 새로 배정되었습니다.</p>${taskLine(projectName, taskLabel)}${memoLine(memo)}`
    ),
  };
}

export function taskStartedEmail(projectName: string, taskLabel: string, contractorName: string) {
  return {
    subject: `[업무 시작] ${contractorName}님이 업무를 시작했습니다`,
    html: wrap("업무 시작 알림", `<p><b>${contractorName}</b> 작업자가 업무를 시작했습니다.</p>${taskLine(projectName, taskLabel)}`),
  };
}

export function taskSubmittedEmail(projectName: string, taskLabel: string, contractorName: string, isResubmit: boolean, fileLink: string) {
  return {
    subject: isResubmit ? `[재제출] "${taskLabel}" 수정 완료, 검수 요청` : `[검수 요청] "${taskLabel}" 업무가 종료되었습니다`,
    html: wrap(
      isResubmit ? "수정 완료 - 재검수 요청" : "검수 요청 알림",
      `<p><b>${contractorName}</b> 작업자가 ${isResubmit ? "수정을 완료하고 재제출" : "업무를 종료"}했습니다. 검수를 진행해주세요.</p>${taskLine(projectName, taskLabel)}
       <p>업로드 파일: <a href="${fileLink}">${fileLink}</a></p>`
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

export function taskHandoffEmail(projectName: string, taskLabel: string, newContractorName: string, reason: string) {
  return {
    subject: `[업무 인계] "${taskLabel}" 업무가 인계되었습니다`,
    html: wrap(
      "업무 인계 알림",
      `<p><b>${newContractorName}</b>님에게 업무가 새로 인계되었습니다.</p>${taskLine(projectName, taskLabel)}
       <p style="background:#f5f5f5; padding:12px; border-radius:6px;"><b>인계 사유</b><br/>${reason}</p>`
    ),
  };
}

export function subManagerAckEmail(projectName: string, taskLabel: string, subManagerName: string, comment: string) {
  return {
    subject: `[참조 확인] "${taskLabel}" - ${subManagerName}님이 확인했습니다`,
    html: wrap(
      "서브 담당자 확인",
      `<p><b>${subManagerName}</b>님이 업무를 확인하고 의견을 남겼습니다.</p>${taskLine(projectName, taskLabel)}
       ${comment?.trim() ? `<p style="background:#f5f5f5; padding:12px; border-radius:6px;">${comment}</p>` : ""}`
    ),
  };
}

export function taskUnlockedEmail(projectName: string, taskLabel: string, contractorName: string) {
  return {
    subject: `[업무 시작 가능] "${taskLabel}" 이전 순서 업무가 완료되었습니다`,
    html: wrap(
      "업무 시작 가능 알림",
      `<p><b>${contractorName}</b>님, 이전 순서 업무가 완료되어 이제 업무를 시작할 수 있습니다.</p>${taskLine(projectName, taskLabel)}`
    ),
  };
}

export function outOfOrderWarningEmail(projectName: string, taskLabel: string, laterTaskLabel: string) {
  return {
    subject: `[순서 주의] "${taskLabel}" 재작업 중인데 다음 순서 업무가 이미 진행 중입니다`,
    html: wrap(
      "⚠️ 업무 순서 확인 필요",
      `<p><b>${taskLabel}</b> 업무가 재작업에 들어갔는데, 다음 순서 업무인 <b>${laterTaskLabel}</b>가 이미 진행 중입니다.</p>
       <p>${taskLine(projectName, taskLabel)}</p>
       <p>자동으로 멈추지 않으니 직접 확인해주세요.</p>`
    ),
  };
}

export function aiCreditDepletedEmail(contractorName: string, serviceName: string, accountLabel: string) {
  return {
    subject: `[크레딧 소진] ${contractorName}님의 ${serviceName} 계정 크레딧이 0이 되었습니다`,
    html: wrap(
      "AI 크레딧 소진 알림",
      `<p><b>${contractorName}</b>님의 <b>${serviceName}</b>${accountLabel ? ` (${accountLabel})` : ""} 계정 잔여 크레딧이 0이 되었습니다.</p>
       <p>충전이 필요한지 확인해주세요.</p>`
    ),
  };
}

export function publishDecidedEmail(projectName: string, decision: "confirmed" | "declined", reason?: string) {
  return {
    subject: decision === "confirmed" ? `[게재 완료] "${projectName}" 프로젝트가 게재되었습니다` : `[게재 불가] "${projectName}" 프로젝트 게재가 불가 처리되었습니다`,
    html: wrap(
      decision === "confirmed" ? "게재 완료" : "게재 불가",
      decision === "confirmed"
        ? `<p>프로젝트 <b>${projectName}</b>이(가) 게재 완료 처리되었습니다.</p>`
        : `<p>프로젝트 <b>${projectName}</b> 게재가 불가 처리되었습니다.</p><p style="background:#f5f5f5; padding:12px; border-radius:6px;">${reason || ""}</p>`
    ),
  };
}
