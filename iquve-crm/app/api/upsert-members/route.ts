import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 30

const INTERNAL_DOMAINS = new Set(['growv.com', 'growv.kr'])
const SKIP_STATUS = new Set(['탈퇴회원'])

function normEmail(v: unknown): string | null {
  if (!v) return null
  const s = String(v).trim().toLowerCase()
  if (s === '탈퇴회원' || !s.includes('@')) return null
  return s
}

function normPhone(v: unknown): string | null {
  if (!v) return null
  let s = String(v).replace(/\.0$/, '').replace(/[^0-9]/g, '')
  if (s.length === 9) s = '0' + s
  if (s.length === 10 && s[0] !== '0') s = '0' + s
  if (s === '01000000000' || s.length < 10) return null
  return s
}

function normDate(v: unknown): string | null {
  if (!v) return null
  const s = String(v).trim()
  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m2) return `${m2[3]}-${m2[1].padStart(2,'0')}-${m2[2].padStart(2,'0')}`
  const m3 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})/)
  if (m3) return `20${m3[3]}-${m3[1].padStart(2,'0')}-${m3[2].padStart(2,'0')}`
  return null
}

function normInt(v: unknown): number {
  if (!v) return 0
  const n = parseInt(String(v).replace(/[^0-9]/g, '') || '0')
  return isNaN(n) ? 0 : n
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

interface DbRow {
  email: string
  parent_name: string | null
  phone: string | null
  social_type: string | null
  member_status: string | null
  join_date: string | null
  profile_date: string | null
  child_name: string | null
  last_pay_date: string | null
  is_paid: boolean
  watch_count: number
  last_watch_date: string | null
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const files = formData.getAll('files') as File[]
    if (!files.length) return NextResponse.json({ error: '파일 없음' }, { status: 400 })

    const merged = new Map<string, DbRow>()
    const fileResults: { name: string; count: number; skipped: number }[] = []

    for (const file of files) {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: false })
      if (!rows.length) continue

      const cols = Object.keys(rows[0])

      const eCol    = findCol(cols, '로그인ID', '로그인아이디', '이메일', 'email')
      const phCol   = findCol(cols, '휴대폰번호', '전화번호')
      const nmCol   = findCol(cols, '학부모명', '이름')
      const scCol   = findCol(cols, '소셜구분', '로그인제공자')
      const stCol   = findCol(cols, '회원상태')
      const jnCol   = findCol(cols, '가입일시', '가입일')
      const pfCol   = findCol(cols, '프로필등록일시', '프로필등록일')
      const pdtCol  = findCol(cols, '최종결제일', '결제일시', '결제일')
      const cnCol   = findCol(cols, '자녀명', '자녀이름')
      const wcCol   = findCol(cols, '영상시청횟수', '시청횟수')
      const lwCol   = findCol(cols, '최종영상시청일', '최종시청일')

      let count = 0, skipped = 0

      for (const row of rows) {
        const email = normEmail(eCol ? row[eCol] : null)
        if (!email || isSkip(email)) { skipped++; continue }

        const status = stCol ? String(row[stCol] ?? '') : ''
        // 탈퇴회원 제외
        if (SKIP_STATUS.has(status)) { skipped++; continue }

        const ex: DbRow = merged.get(email) ?? {
          email,
          parent_name: null,
          child_name: null,
          phone: null,
          social_type: null,
          member_status: null,
          join_date: null,
          profile_date: null,
          last_pay_date: null,
          is_paid: false,
          watch_count: 0,
          last_watch_date: null,
        }

        // 기본 정보
        if (phCol && row[phCol] && !ex.phone)        ex.phone        = normPhone(row[phCol])
        if (nmCol && row[nmCol] && !ex.parent_name)  ex.parent_name  = String(row[nmCol])
        if (cnCol && row[cnCol] && !ex.child_name)     ex.child_name   = String(row[cnCol])
        if (scCol && row[scCol] && !ex.social_type)  ex.social_type  = String(row[scCol])

        // 회원상태: 더 상위 상태로만 업데이트
        if (status) {
          const priority: Record<string, number> = { '프로필미등록': 1, '무료회원': 2, '유료회원': 3 }
          const cur = ex.member_status ?? ''
          if ((priority[status] ?? 0) > (priority[cur] ?? 0)) ex.member_status = status
        }

        // 날짜
        if (jnCol  && row[jnCol]  && !ex.join_date)    ex.join_date    = normDate(row[jnCol])
        // 프로필 등록일: 회원상태가 프로필미등록이 아닌 경우만 저장
        if (pfCol && row[pfCol] && status !== '프로필미등록') {
          const pd = normDate(row[pfCol])
          if (pd && !ex.profile_date) ex.profile_date = pd
        }

        // 결제
        if (status === '유료회원') ex.is_paid = true
        if (pdtCol && row[pdtCol]) {
          ex.is_paid = true
          const pd = normDate(row[pdtCol])
          if (pd && (!ex.last_pay_date || pd > ex.last_pay_date)) ex.last_pay_date = pd
        }

        // 영상 시청
        if (wcCol && row[wcCol]) {
          const wc = normInt(row[wcCol])
          if (wc > ex.watch_count) ex.watch_count = wc
        }
        if (lwCol && row[lwCol]) {
          const ld = normDate(row[lwCol])
          if (ld && (!ex.last_watch_date || ld > ex.last_watch_date)) ex.last_watch_date = ld
        }

        merged.set(email, ex)
        count++
      }

      fileResults.push({ name: file.name, count, skipped })
    }

    if (!merged.size) {
      return NextResponse.json({
        error: '유효한 회원 데이터 없음. 이메일 컬럼(로그인ID / 로그인아이디)을 확인하세요.',
        fileResults,
      }, { status: 400 })
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

    const rows = Array.from(merged.values())
    const CHUNK = 300
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await db
        .from('crm_members')
        .upsert(rows.slice(i, i + CHUNK), { onConflict: 'email', ignoreDuplicates: false })
      if (error) throw new Error(`DB 오류: ${error.message}`)
    }

    return NextResponse.json({ success: true, total: rows.length, files: fileResults })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '오류' }, { status: 500 })
  }
}
