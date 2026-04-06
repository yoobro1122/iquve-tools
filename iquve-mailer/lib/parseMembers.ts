import * as XLSX from 'xlsx'
import type { Category } from './supabase'

// @growv.com / @growv.kr 내부 도메인 필터
const INTERNAL_DOMAINS = ['growv.com', 'growv.kr']

function isInternal(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase()
  return INTERNAL_DOMAINS.includes(domain)
}

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length < 9 || digits === '01000000000') return null
  return digits
}

function classifyMember(paid: boolean, email: string | null, phone: string | null): Category | null {
  if (paid) return '결제회원'
  const hasEmail = !!email && email.includes('@')
  const hasPhone = !!phone
  if (hasEmail && hasPhone) return '이메일+전화번호'
  if (hasEmail) return '이메일만'
  return null // 이메일도 없으면 스킵
}

export interface ParsedMember {
  email: string
  phone: string | null
  category: Category
  paid: boolean
  marketing: boolean
}

export function parseExcel(buffer: ArrayBuffer): {
  members: ParsedMember[]
  skipped: number
  duplicates: number
} {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null })

  const seen = new Set<string>()
  const members: ParsedMember[] = []
  let skipped = 0
  let duplicates = 0

  for (const row of rows) {
    // 이메일 컬럼 감지 (이메일, 이메일.1 등 여러 패턴 대응)
    const emailRaw =
      (row['이메일'] as string) ||
      (row['email'] as string) ||
      Object.values(row).find(
        (v) => typeof v === 'string' && v.includes('@')
      ) as string | undefined

    const email = emailRaw ? String(emailRaw).trim().toLowerCase() : null
    const phone = normalizePhone(row['전화번호'] as string)
    const paid =
      row['결제여부'] === 'Y' || row['결제여부'] === true || row['paid'] === true
    const marketing =
      row['마케팅 활용 수신 동의 여부'] === 'Y' ||
      row['마케팅'] === 'Y' ||
      row['marketing'] === true

    // 유효한 이메일 없으면 스킵
    if (!email || !email.includes('@')) { skipped++; continue }
    // 내부 도메인 스킵
    if (isInternal(email)) { skipped++; continue }
    // 중복 스킵
    if (seen.has(email)) { duplicates++; continue }

    const category = classifyMember(paid, email, phone)
    if (!category) { skipped++; continue }

    seen.add(email)
    members.push({ email, phone, category, paid, marketing })
  }

  return { members, skipped, duplicates }
}
