import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })

    if (!file.name.endsWith('.html') && !file.name.endsWith('.htm')) {
      return NextResponse.json({ error: 'HTML 파일만 업로드 가능합니다.' }, { status: 400 })
    }

    const text = await file.text()
    // 기본 유효성 검사
    if (text.length > 500_000) {
      return NextResponse.json({ error: 'HTML 파일이 너무 큽니다. (최대 500KB)' }, { status: 400 })
    }

    return NextResponse.json({ html: text })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
