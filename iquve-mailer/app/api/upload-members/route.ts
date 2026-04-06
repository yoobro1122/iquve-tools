import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { parseExcel } from '@/lib/parseMembers'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })

    const buffer = await file.arrayBuffer()
    const { members, skipped, duplicates } = parseExcel(buffer)

    if (members.length === 0) {
      return NextResponse.json({ error: '유효한 회원 데이터가 없습니다.' }, { status: 400 })
    }

    const db = supabaseAdmin()

    // upsert: 이메일 기준으로 중복이면 업데이트
    const { error } = await db
      .from('members')
      .upsert(members, { onConflict: 'email', ignoreDuplicates: false })

    if (error) throw error

    return NextResponse.json({
      inserted: members.length,
      skipped,
      duplicates,
      categories: {
        결제회원: members.filter((m) => m.category === '결제회원').length,
        '이메일+전화번호': members.filter((m) => m.category === '이메일+전화번호').length,
        이메일만: members.filter((m) => m.category === '이메일만').length,
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
