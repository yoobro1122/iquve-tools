import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 30

const INTERNAL_DOMAINS = new Set(['growv.com', 'growv.kr'])

function normEmail(v: unknown): string | null {
  if (!v) return null
  const s = String(v).trim().toLowerCase()
  return s.includes('@') ? s : null
}

function normPhone(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  let s = String(v).replace(/\.0$/, '').replace(/[^0-9]/g, '')
  if (s.length === 9) s = '0' + s
  if (s.length === 10 && s[0] !== '0') s = '0' + s
  if (s === '01000000000' || s.length < 10) return null
  return s
}

function normDate(v: unknown): string | null {
  if (!v) return null
  const s = String(v).trim()

  // YYYY-MM-DD (또는 YYYY-MM-DD HH:MM:SS)
  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`

  // MM/DD/YYYY HH:MM (예: 4/10/2026 17:02)
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m2) return `${m2[3]}-${m2[1].padStart(2,'0')}-${m2[2].padStart(2,'0')}`

  // M/DD/YY HH:MM (예: 9/12/25 17:02) → 2000년대로 해석
  const m3 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})/)
  if (m3) return `20${m3[3]}-${m3[1].padStart(2,'0')}-${m3[2].padStart(2,'0')}`

  return null
}

function isSkip(email: string): boolean {
  const domain = (email.split('@')[1] ?? '').toLowerCase()
  return INTERNAL_DOMAINS.has(domain) || /^(quvetest|sv\d)/.test(email)
}

function findCol(cols: string[], ...candidates: string[]): string | null {
  for (const c of candidates) {
    const found = cols.find(k => k === c || k.includes(c))
    if (found) return found
  }
  return null
}

function detectType(cols: string[]): 'user' | 'pay' | 'member' {
  const j = cols.join('|')
  if (/결제상태|결제금액/.test(j)) return 'pay'
  if (/소셜구분|체험여부|프로필등록|체험시작/.test(j)) return 'user'
  return 'member'
}

interface DbRow {
  email: string
  parent_name: string | null; child_name: string | null; phone: string | null
  social_type: string | null; member_status: string | null
  join_date: string | null; profile_date: string | null
  trial_start: string | null; trial_end: string | null
  has_child: boolean; has_trial: boolean; is_paid: boolean
  pay_count: number; pay_total: number; last_pay_date: string | null
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const files = formData.getAll('files') as File[]
    if (!files.length) return NextResponse.json({ error: '파일 없음' }, { status: 400 })

    const merged = new Map<string, DbRow>()
    const fileResults: { name: string; type: string; count: number; sample?: unknown }[] = []

    for (const file of files) {
      const buf = await file.arrayBuffer()
      // raw: true로 읽어서 날짜 원본값 보존
      const wb = XLSX.read(buf, { type: 'array', cellDates: false, raw: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      // header: 1로 raw 배열 먼저 읽어서 컬럼 확인
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        defval: null,
        raw: false,  // 문자열 변환 (날짜 포함)
      })

      if (!rows.length) continue
      const cols = Object.keys(rows[0])
      const type = detectType(cols)

      // 컬럼 매핑
      const eCol   = findCol(cols, '로그인ID', '로그인아이디', '이메일', 'email')
      const phCol  = findCol(cols, '휴대폰번호', '전화번호')
      const nmCol  = findCol(cols, '학부모명', '이름')
      const cnCol  = findCol(cols, '자녀이름')
      const scCol  = findCol(cols, '소셜구분')
      const stCol  = findCol(cols, '회원상태')
      const jnCol  = findCol(cols, '가입일시', '가입일')
      const pfCol  = findCol(cols, '프로필등록일시', '프로필등록일')
      const tsCol  = findCol(cols, '체험시작일')
      const teCol  = findCol(cols, '체험종료일')
      const trCol  = findCol(cols, '체험여부')
      const pdCol  = findCol(cols, '결제여부')
      const psCol  = findCol(cols, '결제상태')
      const paCol  = findCol(cols, '결제금액')
      const pdtCol = findCol(cols, '결제일시', '결제일')
      const mkCol  = findCol(cols, '마케팅수신동의여부', '마케팅')

      // 첫 행 샘플 (디버그)
      const sample: Record<string, unknown> = {}
      if (jnCol) sample['가입일시_raw'] = rows[0][jnCol]
      if (jnCol) sample['가입일시_norm'] = normDate(rows[0][jnCol])
      if (eCol)  sample['이메일'] = rows[0][eCol]
      fileResults.push({ name: file.name, type, count: 0, sample })

      let count = 0
      for (const row of rows) {
        const email = normEmail(eCol ? row[eCol] : null)
        if (!email || isSkip(email)) continue

        if (type === 'pay') {
          if (String(row[psCol ?? ''] ?? '') !== '결제완료') continue
          const existing = merged.get(email)
          if (existing) {
            existing.is_paid = true
            existing.pay_count += 1
            existing.pay_total += parseInt(String(row[paCol ?? ''] ?? '0').replace(/[^0-9]/g, '') || '0')
            const pd = normDate(pdtCol ? row[pdtCol] : null)
            if (pd && (!existing.last_pay_date || pd > existing.last_pay_date)) existing.last_pay_date = pd
          } else {
            merged.set(email, {
              email, parent_name: null, child_name: null, phone: null,
              social_type: null, member_status: null,
              join_date: null, profile_date: null, trial_start: null, trial_end: null,
              has_child: false, has_trial: false, is_paid: true,
              pay_count: 1,
              pay_total: parseInt(String(row[paCol ?? ''] ?? '0').replace(/[^0-9]/g, '') || '0'),
              last_pay_date: normDate(pdtCol ? row[pdtCol] : null),
            })
          }
        } else {
          const existing = merged.get(email) ?? {
            email, parent_name: null, child_name: null, phone: null,
            social_type: null, member_status: null,
            join_date: null, profile_date: null, trial_start: null, trial_end: null,
            has_child: false, has_trial: false, is_paid: false,
            pay_count: 0, pay_total: 0, last_pay_date: null,
          }

          if (phCol && row[phCol] && !existing.phone)       existing.phone         = normPhone(row[phCol])
          if (nmCol && row[nmCol] && !existing.parent_name)  existing.parent_name   = String(row[nmCol])
          if (cnCol && row[cnCol] && !existing.child_name) { existing.child_name    = String(row[cnCol]); existing.has_child = true }
          if (scCol && row[scCol] && !existing.social_type)  existing.social_type   = String(row[scCol])
          if (stCol && row[stCol] && !existing.member_status) existing.member_status = String(row[stCol])

          // 날짜 — normDate로 안전하게 파싱
          if (jnCol  && row[jnCol]  && !existing.join_date)    existing.join_date    = normDate(row[jnCol])
          if (pfCol  && row[pfCol]  && !existing.profile_date) { existing.profile_date = normDate(row[pfCol]); if (existing.profile_date) existing.has_child = true }
          if (tsCol  && row[tsCol]  && !existing.trial_start)  existing.trial_start  = normDate(row[tsCol])
          if (teCol  && row[teCol]  && !existing.trial_end)    existing.trial_end    = normDate(row[teCol])
          if (trCol  && row[trCol]  === 'Y')  existing.has_trial = true
          if (pdCol  && row[pdCol]  === 'Y')  existing.is_paid   = true
          if (existing.member_status === '유료회원') existing.is_paid = true
          // 최종결제일 있으면 유료 회원으로 처리
          const lastPayCol = findCol(Object.keys(row), '최종결제일', '최근결제일', '결제일')
          if (lastPayCol && row[lastPayCol]) {
            existing.is_paid = true
            const pd = normDate(row[lastPayCol])
            if (pd && (!existing.last_pay_date || pd > existing.last_pay_date)) existing.last_pay_date = pd
          }
          // 상품명이 '구독상품없음'이 아니면 유료로 처리
          const prodCol = findCol(Object.keys(row), '상품명')
          if (prodCol && row[prodCol] && String(row[prodCol]) !== '구독상품없음') existing.is_paid = true

          merged.set(email, existing)
          count++
        }
      }
      fileResults[fileResults.length - 1].count = count
    }

    if (!merged.size) return NextResponse.json({ error: '유효한 회원 데이터 없음', fileResults }, { status: 400 })

    // Supabase upsert
    const rows = Array.from(merged.values())
    const CHUNK = 300
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase
        .from('crm_members')
        .upsert(rows.slice(i, i + CHUNK), { onConflict: 'email', ignoreDuplicates: false })
      if (error) throw new Error(`DB 오류: ${error.message} (${error.code})`)
    }

    return NextResponse.json({ success: true, total: rows.length, files: fileResults })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '오류'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
