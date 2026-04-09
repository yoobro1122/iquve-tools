import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { parseRows } from '@/lib/parseExcel'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const files = formData.getAll('files') as File[]
    if (!files.length) return NextResponse.json({ error: '파일 없음' }, { status: 400 })

    // 파일별 파싱 후 이메일 기준 병합
    const merged = new Map<string, Record<string, unknown>>()

    const fileResults: { name: string; type: string; count: number }[] = []

    for (const file of files) {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: false })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: false })

      const { members, type, count } = parseRows(rows)
      fileResults.push({ name: file.name, type, count })

      for (const [email, m] of members) {
        const existing = merged.get(email) ?? {}
        // 병합: 기존 값 있으면 유지, 없으면 새 값으로
        const merged_m: Record<string, unknown> = { ...m }
        for (const [k, v] of Object.entries(existing)) {
          if (v !== null && v !== undefined && v !== false && v !== 0 && v !== '') {
            merged_m[k] = v
          }
        }
        // 결제 정보는 누산
        if (existing.pay_count) {
          merged_m.pay_count = (Number(existing.pay_count) || 0) + (Number(m.pay_count) || 0)
          merged_m.pay_total = (Number(existing.pay_total) || 0) + (Number(m.pay_total) || 0)
        }
        merged.set(email, merged_m)
      }
    }

    // Supabase upsert (이메일 기준)
    const upsertData = Array.from(merged.values()).map(m => {
      const r = { ...m }
      delete r._type
      return r
    })

    if (!upsertData.length) return NextResponse.json({ error: '유효한 회원 없음' }, { status: 400 })

    // 청크로 나눠서 upsert (Supabase 제한)
    const CHUNK = 500
    let inserted = 0, updated = 0
    for (let i = 0; i < upsertData.length; i += CHUNK) {
      const chunk = upsertData.slice(i, i + CHUNK)
      const { error } = await supabase
        .from('crm_members')
        .upsert(chunk, { onConflict: 'email', ignoreDuplicates: false })
      if (error) throw error
      inserted += chunk.length
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
