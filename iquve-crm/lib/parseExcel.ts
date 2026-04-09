// 엑셀 파일을 자동 감지해서 파싱하는 유틸
// 서버사이드 (API Route)에서 사용

const INTERNAL_DOMAINS = new Set(['growv.com', 'growv.kr'])

export interface ParsedRow {
  email: string
  parent_name: string | null
  child_name: string | null
  phone: string | null
  social_type: string | null
  member_status: string | null
  join_date: string | null
  profile_date: string | null
  trial_start: string | null
  trial_end: string | null
  has_child: boolean
  has_trial: boolean
  is_paid: boolean
  pay_count: number
  pay_total: number
  last_pay_date: string | null
  _type: 'user' | 'pay' | 'member'
}

function normEmail(v: unknown): string | null {
  if (!v) return null
  const s = String(v).trim().toLowerCase()
  return s.includes('@') ? s : null
}

function normPhone(v: unknown): string | null {
  if (!v && v !== 0) return null
  const s = String(v).replace(/\.0$/, '').replace(/[^0-9]/g, '')
  const fixed = s.length === 9 ? '0' + s : s.length === 10 && s[0] !== '0' ? '0' + s : s
  if (fixed === '01000000000' || fixed.length < 10) return null
  return fixed
}

function normDate(v: unknown): string | null {
  if (!v) return null
  const s = String(v).trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null
  return s
}

function normAmount(v: unknown): number {
  if (!v) return 0
  return parseInt(String(v).replace(/[^0-9]/g, '') || '0')
}

function isSkip(email: string): boolean {
  const domain = (email.split('@')[1] ?? '').toLowerCase()
  if (INTERNAL_DOMAINS.has(domain)) return true
  if (/^(quvetest|sv\d)/.test(email)) return true
  return false
}

// 컬럼 패턴으로 파일 타입 자동 감지
function detectFileType(cols: string[]): 'user' | 'pay' | 'member' {
  const joined = cols.join('|')
  if (/결제상태|결제금액|결제수단/.test(joined)) return 'pay'
  if (/소셜구분|체험여부|프로필등록|체험시작/.test(joined)) return 'user'
  return 'member'
}

// 컬럼명 fuzzy 찾기
function findCol(cols: string[], ...candidates: string[]): string | null {
  for (const c of candidates) {
    const found = cols.find(k => k === c || k.includes(c))
    if (found) return found
  }
  return null
}

export function parseRows(
  rows: Record<string, unknown>[]
): { members: Map<string, ParsedRow>; type: string; count: number } {
  if (!rows.length) return { members: new Map(), type: 'unknown', count: 0 }

  const cols = Object.keys(rows[0])
  const type = detectFileType(cols)
  const members = new Map<string, ParsedRow>()

  // 컬럼 찾기
  const eCol    = findCol(cols, '로그인ID', '이메일', 'email')
  const phCol   = findCol(cols, '휴대폰번호', '전화번호', 'phone')
  const nmCol   = findCol(cols, '학부모명', '이름')
  const cnCol   = findCol(cols, '자녀이름')
  const scCol   = findCol(cols, '소셜구분')
  const stCol   = findCol(cols, '회원상태')
  const jnCol   = findCol(cols, '가입일시', '가입일')
  const pfCol   = findCol(cols, '프로필등록일시', '프로필등록일')
  const tsCol   = findCol(cols, '체험시작일')
  const teCol   = findCol(cols, '체험종료일')
  const trCol   = findCol(cols, '체험여부')
  const pdCol   = findCol(cols, '결제여부')
  const psCol   = findCol(cols, '결제상태')
  const paCol   = findCol(cols, '결제금액')
  const pdtCol  = findCol(cols, '결제일시', '결제일')
  const mkCol   = findCol(cols, '마케팅')

  for (const row of rows) {
    const email = normEmail(eCol ? row[eCol] : null)
    if (!email || isSkip(email)) continue

    const existing = members.get(email) ?? {
      email,
      parent_name: null, child_name: null, phone: null,
      social_type: null, member_status: null,
      join_date: null, profile_date: null,
      trial_start: null, trial_end: null,
      has_child: false, has_trial: false, is_paid: false,
      pay_count: 0, pay_total: 0, last_pay_date: null,
      _type: type,
    } as ParsedRow

    if (type === 'pay') {
      const status = String(row[psCol ?? ''] ?? '')
      if (status !== '결제완료') continue
      existing.is_paid = true
      existing.pay_count += 1
      existing.pay_total += normAmount(paCol ? row[paCol] : null)
      const pd = normDate(pdtCol ? row[pdtCol] : null)
      if (pd && (!existing.last_pay_date || pd > existing.last_pay_date)) {
        existing.last_pay_date = pd
      }

    } else {
      // user / member 공통
      if (phCol && row[phCol] && !existing.phone)
        existing.phone = normPhone(row[phCol])
      if (nmCol && row[nmCol] && !existing.parent_name)
        existing.parent_name = String(row[nmCol])
      if (cnCol && row[cnCol] && !existing.child_name) {
        existing.child_name = String(row[cnCol])
        existing.has_child = true
      }
      if (scCol && row[scCol] && !existing.social_type)
        existing.social_type = String(row[scCol])
      if (stCol && row[stCol] && !existing.member_status)
        existing.member_status = String(row[stCol])
      if (jnCol && row[jnCol] && !existing.join_date)
        existing.join_date = normDate(row[jnCol])
      if (pfCol && row[pfCol] && !existing.profile_date) {
        existing.profile_date = normDate(row[pfCol])
        if (existing.profile_date) existing.has_child = true
      }
      if (tsCol && row[tsCol] && !existing.trial_start)
        existing.trial_start = normDate(row[tsCol])
      if (teCol && row[teCol] && !existing.trial_end)
        existing.trial_end = normDate(row[teCol])
      if (trCol && row[trCol] === 'Y') existing.has_trial = true
      if (pdCol && row[pdCol] === 'Y') existing.is_paid = true
      if (existing.member_status === '유료회원') existing.is_paid = true
    }

    members.set(email, existing)
  }

  return { members, type, count: members.size }
}
