'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Campaign, Category } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────────
interface DBStats { total: number; 결제회원: number; '이메일+전화번호': number; 이메일만: number }

// ─── Helpers ─────────────────────────────────────────────────────────────────
const CAT_LABELS: Record<Category, string> = {
  결제회원: '💳 결제회원',
  '이메일+전화번호': '📋 이메일 + 전화번호',
  이메일만: '✉️ 이메일만',
}

const STEP_LABELS = ['① DB 업로드', '② 메일 작성', '③ 그룹 · 미리보기', '④ 발송']

// ─── Component ───────────────────────────────────────────────────────────────
export default function Home() {
  const [step, setStep] = useState(0)

  // DB
  const [dbStats, setDbStats] = useState<DBStats | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<string | null>(null)

  // 메일 작성
  const [subject, setSubject] = useState('')
  const [htmlContent, setHtmlContent] = useState('')
  const [campaignTitle, setCampaignTitle] = useState('')
  const [htmlMode, setHtmlMode] = useState<'upload' | 'editor'>('upload')

  // 그룹
  const [selectedGroups, setSelectedGroups] = useState<Category[]>([])
  const [recipientCount, setRecipientCount] = useState<number | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  // 발송
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ total: number; sentCount: number; failCount: number } | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])

  // refs
  const dbFileRef = useRef<HTMLInputElement>(null)
  const htmlFileRef = useRef<HTMLInputElement>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' | 'info' } | null>(null)

  function showToast(msg: string, type: 'ok' | 'err' | 'info' = 'info') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  // ── DB 통계 로드 ──
  async function loadStats() {
    const { data, error } = await supabase.from('members').select('category')
    if (error || !data) return
    const stats: DBStats = { total: data.length, 결제회원: 0, '이메일+전화번호': 0, 이메일만: 0 }
    data.forEach((r: { category: Category }) => { stats[r.category]++ })
    setDbStats(stats)
  }

  async function loadCampaigns() {
    const { data } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)
    if (data) setCampaigns(data as Campaign[])
  }

  useEffect(() => { loadStats(); loadCampaigns() }, [])

  // ── 그룹 선택 시 수신자 수 계산 ──
  useEffect(() => {
    if (selectedGroups.length === 0) { setRecipientCount(null); return }
    supabase
      .from('members')
      .select('id', { count: 'exact', head: true })
      .in('category', selectedGroups)
      .then(({ count }) => setRecipientCount(count ?? 0))
  }, [selectedGroups])

  // ── DB 파일 업로드 ──
  async function handleDbUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setUploadResult(null)
    const fd = new FormData(); fd.append('file', file)
    try {
      const res = await fetch('/api/upload-members', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setUploadResult(
        `✅ ${json.inserted}명 저장 완료 (내부 도메인·중복 ${json.skipped + json.duplicates}건 제외)\n` +
        `  💳 결제 ${json.categories['결제회원']}  📋 이메일+전화 ${json.categories['이메일+전화번호']}  ✉️ 이메일만 ${json.categories['이메일만']}`
      )
      showToast(`${json.inserted}명 DB 저장 완료`, 'ok')
      await loadStats()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '오류'
      showToast(msg, 'err')
    } finally {
      setUploading(false)
      if (dbFileRef.current) dbFileRef.current.value = ''
    }
  }

  // ── HTML 파일 업로드 ──
  async function handleHtmlUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData(); fd.append('file', file)
    try {
      const res = await fetch('/api/upload-template', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setHtmlContent(json.html)
      showToast('HTML 템플릿 로드 완료', 'ok')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '오류'
      showToast(msg, 'err')
    } finally {
      if (htmlFileRef.current) htmlFileRef.current.value = ''
    }
  }

  function toggleGroup(cat: Category) {
    setSelectedGroups((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    )
  }

  // ── 캠페인 저장 + 발송 ──
  async function handleSend() {
    if (!subject.trim()) { showToast('메일 제목을 입력해주세요.', 'err'); return }
    if (!htmlContent.trim()) { showToast('메일 내용(HTML)을 입력해주세요.', 'err'); return }
    if (selectedGroups.length === 0) { showToast('발송 그룹을 하나 이상 선택해주세요.', 'err'); return }

    setSending(true); setSendResult(null)
    try {
      // 1. 캠페인 생성
      const { data: campaign, error: cErr } = await supabase
        .from('campaigns')
        .insert({
          title: campaignTitle || subject,
          subject,
          html_content: htmlContent,
          groups: selectedGroups,
        })
        .select()
        .single()
      if (cErr || !campaign) throw new Error('캠페인 생성 실패: ' + cErr?.message)

      // 2. 발송
      const res = await fetch('/api/send-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: campaign.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      setSendResult(json)
      showToast(`발송 완료! ${json.sentCount}/${json.total}건 성공`, 'ok')
      await loadCampaigns()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '오류'
      showToast(msg, 'err')
    } finally {
      setSending(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f1f3f9' }}>
      {/* Header */}
      <header style={{
        background: 'linear-gradient(135deg,#3d4fd7 0%,#5b6ef5 100%)',
        padding: '18px 36px', display: 'flex', alignItems: 'center', gap: 16,
        boxShadow: '0 3px 20px rgba(61,79,215,.3)',
      }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: 'white', letterSpacing: -1 }}>
          i<span style={{ color: '#a8b4ff' }}>Q</span>uve <span style={{ fontWeight: 400, opacity: .7 }}>메일 발송</span>
        </div>
        {dbStats && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, fontSize: 13, color: 'rgba(255,255,255,.75)' }}>
            <span>전체 <b style={{ color: 'white' }}>{dbStats.total.toLocaleString()}</b>명</span>
            <span>💳 <b style={{ color: 'white' }}>{dbStats.결제회원}</b></span>
            <span>📋 <b style={{ color: 'white' }}>{dbStats['이메일+전화번호']}</b></span>
            <span>✉️ <b style={{ color: 'white' }}>{dbStats.이메일만}</b></span>
          </div>
        )}
      </header>

      {/* Step Nav */}
      <nav style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 36px', display: 'flex', gap: 0 }}>
        {STEP_LABELS.map((label, i) => (
          <button key={i} onClick={() => setStep(i)}
            style={{
              padding: '14px 24px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: step === i ? 700 : 400,
              color: step === i ? '#3d4fd7' : '#64748b',
              borderBottom: step === i ? '2px solid #3d4fd7' : '2px solid transparent',
              transition: 'all .15s',
            }}>
            {label}
          </button>
        ))}
      </nav>

      <main style={{ maxWidth: 900, margin: '32px auto', padding: '0 24px' }}>

        {/* ── Step 0: DB 업로드 ── */}
        {step === 0 && (
          <div>
            <SectionTitle>회원 DB 업로드</SectionTitle>
            <p style={{ color: '#64748b', marginBottom: 24, fontSize: 14, lineHeight: 1.7 }}>
              기존 포맷의 엑셀 파일을 업로드하세요.<br />
              <b>@growv.com / @growv.kr</b> 내부 도메인과 중복 이메일은 자동 제외됩니다.<br />
              동일 이메일이 DB에 있으면 최신 정보로 업데이트됩니다.
            </p>

            <UploadZone
              label="엑셀 파일 (.xlsx) 드래그 앤 드롭 또는 클릭"
              accept=".xlsx,.xls"
              loading={uploading}
              inputRef={dbFileRef}
              onChange={handleDbUpload}
              icon="📊"
            />

            {uploadResult && (
              <div style={{
                marginTop: 20, padding: '16px 20px', background: '#f0fdf4',
                border: '1px solid #bbf7d0', borderRadius: 12, fontSize: 13,
                color: '#15803d', lineHeight: 1.8, whiteSpace: 'pre-line',
              }}>
                {uploadResult}
              </div>
            )}

            {dbStats && (
              <div style={{ marginTop: 28 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', marginBottom: 12, letterSpacing: .5 }}>
                  현재 DB 현황
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
                  {([
                    { label: '전체', val: dbStats.total, color: '#64748b' },
                    { label: '💳 결제회원', val: dbStats.결제회원, color: '#e84393' },
                    { label: '📋 이메일+전화', val: dbStats['이메일+전화번호'], color: '#3d4fd7' },
                    { label: '✉️ 이메일만', val: dbStats.이메일만, color: '#8b5cf6' },
                  ] as const).map((s) => (
                    <StatCard key={s.label} label={s.label} value={s.val} color={s.color} />
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 28, textAlign: 'right' }}>
              <Btn primary onClick={() => setStep(1)}>다음: 메일 작성 →</Btn>
            </div>
          </div>
        )}

        {/* ── Step 1: 메일 작성 ── */}
        {step === 1 && (
          <div>
            <SectionTitle>메일 작성</SectionTitle>

            <Label>캠페인 이름 (내부용)</Label>
            <Input
              value={campaignTitle}
              onChange={(e) => setCampaignTitle(e.target.value)}
              placeholder="예: 4월 첫째주 뉴스레터"
            />

            <Label style={{ marginTop: 20 }}>메일 제목 *</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="예: 아이큐브에서 드리는 특별한 소식 🎉"
            />

            <Label style={{ marginTop: 20 }}>메일 본문 (HTML)</Label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <TabBtn active={htmlMode === 'upload'} onClick={() => setHtmlMode('upload')}>📁 HTML 파일 업로드</TabBtn>
              <TabBtn active={htmlMode === 'editor'} onClick={() => setHtmlMode('editor')}>✏️ 직접 입력</TabBtn>
            </div>

            {htmlMode === 'upload' ? (
              <div>
                <UploadZone
                  label="HTML 파일 드래그 앤 드롭 또는 클릭"
                  accept=".html,.htm"
                  loading={false}
                  inputRef={htmlFileRef}
                  onChange={handleHtmlUpload}
                  icon="🌐"
                  compact
                />
                {htmlContent && (
                  <div style={{
                    marginTop: 10, padding: '10px 14px', background: '#f0fdf4',
                    border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 13, color: '#15803d'
                  }}>
                    ✅ HTML 로드됨 ({htmlContent.length.toLocaleString()} 자)
                  </div>
                )}
              </div>
            ) : (
              <textarea
                value={htmlContent}
                onChange={(e) => setHtmlContent(e.target.value)}
                placeholder="<html>...</html> 형식으로 입력하세요"
                style={{
                  width: '100%', minHeight: 320, padding: '14px 16px',
                  border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13,
                  fontFamily: 'monospace', resize: 'vertical', outline: 'none',
                  background: '#f8fafc', color: '#1e293b', lineHeight: 1.6,
                }}
              />
            )}

            <div style={{ marginTop: 28, display: 'flex', justifyContent: 'space-between' }}>
              <Btn onClick={() => setStep(0)}>← 이전</Btn>
              <Btn primary onClick={() => {
                if (!subject.trim()) { showToast('메일 제목을 입력해주세요.', 'err'); return }
                if (!htmlContent.trim()) { showToast('메일 내용을 입력해주세요.', 'err'); return }
                setStep(2)
              }}>다음: 그룹 선택 →</Btn>
            </div>
          </div>
        )}

        {/* ── Step 2: 그룹 선택 + 미리보기 ── */}
        {step === 2 && (
          <div>
            <SectionTitle>수신 그룹 선택 및 미리보기</SectionTitle>

            <Label>발송할 그룹 선택 *</Label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
              {(Object.entries(CAT_LABELS) as [Category, string][]).map(([cat, label]) => {
                const active = selectedGroups.includes(cat)
                const count = dbStats?.[cat as keyof DBStats] as number | undefined
                return (
                  <button key={cat} onClick={() => toggleGroup(cat)}
                    style={{
                      padding: '16px', border: `2px solid ${active ? '#3d4fd7' : '#e2e8f0'}`,
                      borderRadius: 12, background: active ? '#eff2ff' : 'white',
                      cursor: 'pointer', textAlign: 'left', transition: 'all .15s',
                    }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: active ? '#3d4fd7' : '#374151', marginBottom: 4 }}>
                      {label}
                    </div>
                    {count !== undefined && (
                      <div style={{ fontSize: 13, color: '#94a3b8' }}>{count.toLocaleString()}명</div>
                    )}
                    {active && <div style={{ fontSize: 12, color: '#3d4fd7', marginTop: 4 }}>✓ 선택됨</div>}
                  </button>
                )
              })}
            </div>

            {recipientCount !== null && selectedGroups.length > 0 && (
              <div style={{
                padding: '14px 18px', background: '#eff2ff', border: '1px solid #c7d2fe',
                borderRadius: 10, fontSize: 14, color: '#3d4fd7', fontWeight: 600, marginBottom: 20,
              }}>
                📬 총 <span style={{ fontSize: 20 }}>{recipientCount.toLocaleString()}</span>명에게 발송됩니다
              </div>
            )}

            {/* 제목 요약 */}
            <div style={{
              padding: '14px 18px', background: 'white', border: '1px solid #e2e8f0',
              borderRadius: 10, fontSize: 14, marginBottom: 16,
            }}>
              <span style={{ color: '#94a3b8', marginRight: 8 }}>제목:</span>
              <b>{subject || '(미입력)'}</b>
            </div>

            {/* 미리보기 버튼 */}
            <button onClick={() => setPreviewOpen(true)}
              style={{
                width: '100%', padding: '12px', border: '1.5px dashed #3d4fd7',
                borderRadius: 10, background: 'transparent', cursor: 'pointer',
                color: '#3d4fd7', fontWeight: 700, fontSize: 14,
              }}>
              🔍 메일 미리보기
            </button>

            <div style={{ marginTop: 28, display: 'flex', justifyContent: 'space-between' }}>
              <Btn onClick={() => setStep(1)}>← 이전</Btn>
              <Btn primary onClick={() => {
                if (selectedGroups.length === 0) { showToast('그룹을 선택해주세요.', 'err'); return }
                setStep(3)
              }}>다음: 발송 확인 →</Btn>
            </div>
          </div>
        )}

        {/* ── Step 3: 발송 ── */}
        {step === 3 && (
          <div>
            <SectionTitle>발송 확인</SectionTitle>

            <div style={{
              padding: '24px', background: 'white', borderRadius: 16,
              border: '1px solid #e2e8f0', marginBottom: 24,
            }}>
              <Row label="캠페인 이름" value={campaignTitle || subject} />
              <Row label="메일 제목" value={subject} />
              <Row label="발송 그룹" value={selectedGroups.map((g) => CAT_LABELS[g]).join(', ')} />
              <Row label="수신자 수" value={`${(recipientCount ?? 0).toLocaleString()}명`} />
              <Row label="발신자" value="아이큐브 <iquve@growv.com>" />
              <Row label="HTML 크기" value={`${(htmlContent.length / 1024).toFixed(1)} KB`} />
            </div>

            {!sendResult ? (
              <div style={{ textAlign: 'center' }}>
                <button onClick={handleSend} disabled={sending}
                  style={{
                    padding: '16px 48px', background: sending ? '#94a3b8' : '#e84393',
                    color: 'white', border: 'none', borderRadius: 12,
                    fontSize: 16, fontWeight: 800, cursor: sending ? 'not-allowed' : 'pointer',
                    transition: 'all .15s', display: 'inline-flex', alignItems: 'center', gap: 10,
                  }}>
                  {sending ? (
                    <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span> 발송 중...</>
                  ) : '🚀 메일 발송 시작'}
                </button>
                <p style={{ marginTop: 12, fontSize: 13, color: '#94a3b8' }}>
                  발송 후 취소할 수 없습니다. 내용을 다시 확인해주세요.
                </p>
              </div>
            ) : (
              <div style={{
                padding: '28px', background: '#f0fdf4', border: '1px solid #86efac',
                borderRadius: 16, textAlign: 'center',
              }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#15803d', marginBottom: 8 }}>
                  발송 완료!
                </div>
                <div style={{ fontSize: 14, color: '#166534', lineHeight: 1.8 }}>
                  총 {sendResult.total.toLocaleString()}명 중 <b>{sendResult.sentCount.toLocaleString()}명 성공</b>
                  {sendResult.failCount > 0 && `, ${sendResult.failCount}명 실패`}
                </div>
              </div>
            )}

            <div style={{ marginTop: 28, display: 'flex', justifyContent: 'space-between' }}>
              <Btn onClick={() => setStep(2)}>← 이전</Btn>
              {sendResult && (
                <Btn primary onClick={() => {
                  setStep(0); setSubject(''); setHtmlContent(''); setCampaignTitle('')
                  setSelectedGroups([]); setRecipientCount(null); setSendResult(null)
                }}>새 캠페인 만들기</Btn>
              )}
            </div>
          </div>
        )}

        {/* ── 발송 이력 ── */}
        {campaigns.length > 0 && (
          <div style={{ marginTop: 48 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', marginBottom: 12, letterSpacing: .5 }}>
              최근 발송 이력
            </div>
            <div style={{
              background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['제목', '그룹', '발송', '성공', '실패', '상태', '날짜'].map((h) => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#94a3b8', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{c.title}</td>
                      <td style={{ padding: '10px 14px', color: '#64748b' }}>{c.groups.join(', ')}</td>
                      <td style={{ padding: '10px 14px' }}>{c.total_count.toLocaleString()}</td>
                      <td style={{ padding: '10px 14px', color: '#16a34a' }}>{c.sent_count.toLocaleString()}</td>
                      <td style={{ padding: '10px 14px', color: c.fail_count > 0 ? '#dc2626' : '#94a3b8' }}>{c.fail_count}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <StatusBadge status={c.status} />
                      </td>
                      <td style={{ padding: '10px 14px', color: '#94a3b8' }}>
                        {c.sent_at ? new Date(c.sent_at).toLocaleDateString('ko-KR') : new Date(c.created_at).toLocaleDateString('ko-KR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* ── Preview Modal ── */}
      {previewOpen && (
        <div
          onClick={() => setPreviewOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: 16, width: '100%', maxWidth: 720,
              maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
              boxShadow: '0 24px 80px rgba(0,0,0,.3)',
            }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 2 }}>미리보기</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{subject}</div>
              </div>
              <button onClick={() => setPreviewOpen(false)}
                style={{
                  border: 'none', background: '#f1f5f9', borderRadius: 8,
                  width: 32, height: 32, cursor: 'pointer', fontSize: 18, color: '#64748b',
                }}>×</button>
            </div>
            {/* Mail header strip */}
            <div style={{ padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 13, color: '#64748b' }}>
              <b>보낸 사람:</b> 아이큐브 &lt;iquve@growv.com&gt;
              &nbsp;&nbsp;<b>제목:</b> {subject}
            </div>
            {/* iframe preview */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              <iframe
                srcDoc={htmlContent || '<p style="padding:20px;color:#888">HTML 내용이 없습니다.</p>'}
                style={{ width: '100%', height: '100%', minHeight: 500, border: 'none' }}
                title="메일 미리보기"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28,
          padding: '14px 22px', borderRadius: 12, fontWeight: 600, fontSize: 14,
          color: 'white', zIndex: 2000, boxShadow: '0 8px 32px rgba(0,0,0,.2)',
          background: toast.type === 'ok' ? '#16a34a' : toast.type === 'err' ? '#dc2626' : '#3d4fd7',
          animation: 'fadeIn .2s ease',
        }}>
          {toast.msg}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
      `}</style>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20, color: '#1a1f36' }}>{children}</h2>
}

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6, ...style }}>{children}</div>
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: '100%', padding: '10px 14px',
        border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14,
        fontFamily: 'inherit', outline: 'none',
        transition: 'border-color .15s', background: 'white', color: '#1e293b',
        ...props.style,
      }}
      onFocus={(e) => { e.target.style.borderColor = '#3d4fd7' }}
      onBlur={(e) => { e.target.style.borderColor = '#e2e8f0' }}
    />
  )
}

function Btn({ children, primary, onClick, disabled }: {
  children: React.ReactNode; primary?: boolean; onClick?: () => void; disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        padding: '10px 24px', border: primary ? 'none' : '1.5px solid #e2e8f0',
        borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
        background: primary ? '#3d4fd7' : 'white', color: primary ? 'white' : '#374151',
        transition: 'all .15s', opacity: disabled ? .5 : 1,
      }}>
      {children}
    </button>
  )
}

function TabBtn({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{
        padding: '8px 16px', border: `1.5px solid ${active ? '#3d4fd7' : '#e2e8f0'}`,
        borderRadius: 8, fontSize: 13, fontWeight: active ? 700 : 400,
        background: active ? '#eff2ff' : 'white', color: active ? '#3d4fd7' : '#64748b',
        cursor: 'pointer', transition: 'all .15s',
      }}>
      {children}
    </button>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: 'white', borderRadius: 12, padding: '18px 20px',
      border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,.04)',
    }}>
      <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 900, color }}>{value.toLocaleString()}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 16, padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ width: 120, fontSize: 13, color: '#94a3b8', flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{value}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: Campaign['status'] }) {
  const map = {
    draft:   { label: '임시저장', bg: '#f1f5f9', color: '#64748b' },
    sending: { label: '발송 중',  bg: '#fef9c3', color: '#a16207' },
    done:    { label: '완료',    bg: '#dcfce7', color: '#15803d' },
    error:   { label: '오류',    bg: '#fee2e2', color: '#dc2626' },
  }
  const s = map[status] ?? map.draft
  return (
    <span style={{
      padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  )
}

function UploadZone({
  label, accept, loading, inputRef, onChange, icon, compact,
}: {
  label: string; accept: string; loading: boolean
  inputRef: React.RefObject<HTMLInputElement>
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  icon: string; compact?: boolean
}) {
  return (
    <label style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      border: '2px dashed #c7d2fe', borderRadius: 14, padding: compact ? '20px' : '40px',
      cursor: loading ? 'not-allowed' : 'pointer', background: '#f8faff',
      transition: 'all .15s', opacity: loading ? .6 : 1,
      gap: 8,
    }}>
      <input ref={inputRef} type="file" accept={accept} style={{ display: 'none' }} onChange={onChange} disabled={loading} />
      <div style={{ fontSize: compact ? 28 : 40 }}>{loading ? '⏳' : icon}</div>
      <div style={{ fontSize: 14, color: '#6366f1', fontWeight: 600 }}>{loading ? '업로드 중...' : label}</div>
    </label>
  )
}
