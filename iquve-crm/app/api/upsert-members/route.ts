import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { parseRows } from '@/lib/parseExcel'

export const runtime = 'nodejs'
export const maxDuration = 30

// DB 컬럼과 정확히 일치하는 타입
interface DbRow {
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
}

function toDbRow(m: Record<string, unknown>): DbRow {
  return {
    email:         String(m.email ?? ''),
    parent_name:   m.parent_name   ? String(m.parent_name)   : null,
    child_name:    m.child_name    ? String(m.child_name)    : null,
    phone:         m.phone         ? String(m.phone)         : null,
    social_type:   m.social_type   ? String(m.social_type)   : null,
    member_status: m.member_status ? String(m.member_status) : null,
    join_date:     m.join_date     ? String(m.join_date)     : null,
    profile_date:  m.profile_date  ? String(m.profile_date)  : null,
    trial_start:   m.trial_start   ? String(m.trial_start)   : null,
    trial_end:     m.trial_end     ? String(m.trial_end)     : null,
    has_child:     Boolean(m.has_child),
    has_trial:     Boolean(m.has_trial),
    is_paid:       Boolean(m.is_paid),
    pay_count:     Number(m.pay_count)     || 0,
    pay_total:     Number(m.pay_total)     || 0,
    last_pay_date: m.last_pay_date ? String(m.last_pay_date) : null,
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const files = formData.getAll('files') as File[]
    if (!files.length) return NextResponse.json({ error: '파일 없음' }, { status: 400 })

    const merged = new Map<string, Record<string, unknown>>()
    const fileResults: { name: string; type: string; count: number }[] = []

    for (const file of files) {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: false })

      const { members, type, count } = parseRows(rows)
      fileResults.push({ name: file.name, type, count })

      for (const [email, m] of members) {
        const existing = merged.get(email)
        if (!existing) {
          merged.set(email, { ...m })
          continue
        }
        // 병합: 기존 값 보존 + 새 값으로 보완
        const merged_m: Record<string, unknown> = { ...existing }
        for (const [k, v] of Object.entries(m)) {
          const cur = existing[k]
          const isEmpty = cur === null || cur === undefined || cur === '' || cur === false || cur === 0
          if (isEmpty && v !== null && v !== undefined && v !== '' && v !== false) {
            merged_m[k] = v
          }
        }
        // 결제 정보 누산
        merged_m.pay_count = (Number(existing.pay_count) || 0) + (Number(m.pay_count) || 0)
        merged_m.pay_total = (Number(existing.pay_total) || 0) + (Number(m.pay_total) || 0)
        if (m.is_paid) merged_m.is_paid = true
        merged.set(email, merged_m)
      }
    }

    if (!merged.size) {
      return NextResponse.json({ error: '유효한 회원 데이터가 없습니다. 이메일 컬럼을 확인해주세요.' }, { status: 400 })
    }

    // DB 컬럼만 추출해서 upsert
    const upsertData: DbRow[] = Array.from(merged.values()).map(toDbRow)

    const CHUNK = 300
    for (let i = 0; i < upsertData.length; i += CHUNK) {
      const chunk = upsertData.slice(i, i + CHUNK)
      const { error } = await supabase
        .from('crm_members')
        .upsert(chunk, { onConflict: 'email', ignoreDuplicates: false })
      if (error) {
        console.error('Supabase upsert error:', error)
        throw new Error(`DB 저장 오류: ${error.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      total: upsertData.length,
      files: fileResults,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
