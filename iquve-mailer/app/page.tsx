'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Campaign, Category } from '@/lib/supabase'

interface DBStats {
  total: number
  결제회원: number
  '이메일+전화번호': number
  이메일만: number
}

const CAT_LABELS: Record<Category, string> = {
  결제회원: '💳 결제회원',
  '이메일+전화번호': '📋 이메일 + 전화번호',
  이메일만: '✉️ 이메일만',
}

const TABS = ['① DB 업로드', '② 메일 작성', '③ 그룹 · 수신자', '④ 발송', '📋 발송 이력']

const cardStyle: React.CSSProperties = {
  background: 'white', borderRadius: 16, padding: '24px',
  border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,.05)',
}

export default function Home() {
  const [tab, setTab] = useState(0)

  // DB
  const [dbStats, setDbStats] = useState<DBStats | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<string | null>(null)

  // 메일 작성
  const [campaignTitle, setCampaignTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [htmlContent, setHtmlContent] = useState('')
  const [htmlMode, setHtmlMode] = useState<'upload' | 'editor'>('upload')
  const [step2Preview, setStep2Preview] = useState(false)

  // 그룹 + 수기 이메일
  const [selectedGroups, setSelectedGroups] = useState<Category[]>([])
  const [manualEmails, setManualEmails] = useState<string[]>([])
  const [manualInput, setManualInput] = useState('')
  const [manualError, setManualError] = useState('')
  const [recipientCount, setRecipientCount] = useState<number | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  // 발송
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ total: number; sentCount: number; failCount: number } | null>(null)

  // 이력
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [historyDetail, setHistoryDetail] = useState<Campaign | null>(null)
  const [historyPreview, setHistoryPreview] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)

  const dbFileRef = useRef<HTMLInputElement>(null)
  const htmlFileRef = useRef<HTMLInputElement>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' | 'info' } | null>(null)

  function showToast(msg: string, type: 'ok' | 'err' | 'info' = 'info') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const loadStats = useCallback(async () => {
    const { data } = await supabase.from('members').select('category')
    if (!data) return
    const s: DBStats = { total: data.length, 결제회원: 0, '이메일+전화번호': 0, 이메일만: 0 }
    data.forEach((r: { category: Category }) => { s[r.category]++ })
    setDbStats(s)
  }, [])

  const loadCampaigns = useCallback(async () => {
    setLoadingHistory(true)
    const { data } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setCampaigns(data as Campaign[])
    setLoadingHistory(false)
  }, [])

  useEffect(() => { loadStats(); loadCampaigns() }, [loadStats, loadCampaigns])

  useEffect(() => {
    if (selectedGroups.length === 0 && manualEmails.length === 0) { setRecipientCount(null); return }
    if (selectedGroups.length === 0) { setRecipientCount(manualEmails.length); return }
    supabase
      .from('members')
      .select('id', { count: 'exact', head: true })
      .in('category', selectedGroups)
      .then(({ count }) => setRecipientCount((count ?? 0) + manualEmails.length))
  }, [selectedGroups, manualEmails])

  async function handleDbUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
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
      showToast(err instanceof Error ? err.message : '오류', 'err')
    } finally {
      setUploading(false)
      if (dbFileRef.current) dbFileRef.current.value = ''
    }
  }

  async function handleHtmlUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const fd = new FormData(); fd.append('file', file)
    try {
      const res = await fetch('/api/upload-template', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setHtmlContent(json.html)
      showToast('HTML 로드 완료', 'ok')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '오류', 'err')
    } finally {
      if (htmlFileRef.current) htmlFileRef.current.value = ''
    }
  }

  function addManualEmails() {
    setManualError('')
    const lines = manualInput.split(/[\n,;]/).map(s => s.trim().toLowerCase()).filter(Boolean)
    const valid: string[] = []
    const invalid: string[] = []
    for (const e of lines) {
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && !manualEmails.includes(e)) {
        valid.push(e)
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
        invalid.push(e)
      }
    }
    if (invalid.length > 0) setManualError(`유효하지 않은 이메일: ${invalid.join(', ')}`)
    if (valid.length > 0) {
      setManualEmails(prev => [...prev, ...valid])
      setManualInput('')
      showToast(`${valid.length}개 추가됨`, 'ok')
    }
  }

  async function handleSend() {
    if (!subject.trim()) { showToast('메일 제목을 입력해주세요.', 'err'); return }
    if (!htmlContent.trim()) { showToast('메일 내용을 입력해주세요.', 'err'); return }
    if (selectedGroups.length === 0 && manualEmails.length === 0) {
      showToast('발송 그룹 또는 수신자를 선택해주세요.', 'err'); return
    }
    setSending(true); setSendResult(null)
    try {
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

      const res = await fetch('/api/send-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: campaign.id, manualEmails }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setSendResult(json)
      showToast(`발송 완료! ${json.sentCount}/${json.total}건 성공`, 'ok')
      await loadCampaigns()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '오류', 'err')
    } finally {
      setSending(false)
    }
  }

  function resetAll() {
    setCampaignTitle(''); setSubject(''); setHtmlContent('')
    setSelectedGroups([]); setManualEmails([]); setManualInput('')
    setRecipientCount(null); setSendResult(null); setTab(0)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f3f9' }}>

      {/* Header */}
      <header style={{
        background: 'linear-gradient(135deg,#3d4fd7 0%,#5b6ef5 100%)',
        padding: '18px 36px', display: 'flex', alignItems: 'center', gap: 16,
        boxShadow: '0 3px 20px rgba(61,79,215,.3)',
      }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: 'white', letterSpacing: -1 }}>
          i<span style={{ color: '#a8b4ff' }}>Q</span>uve
          <span style={{ fontWeight: 400, opacity: .7, marginLeft: 8 }}>메일 발송</span>
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

      {/* Tab Nav */}
      <nav style={{
        background: 'white', borderBottom: '1px solid #e2e8f0',
        padding: '0 36px', display: 'flex', overflowX: 'auto',
      }}>
        {TABS.map((label, i) => (
          <button key={i} onClick={() => { setTab(i); if (i === 4) loadCampaigns() }}
            style={{
              padding: '14px 22px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: tab === i ? 700 : 400,
              color: tab === i ? '#3d4fd7' : '#64748b',
              borderBottom: tab === i ? '2.5px solid #3d4fd7' : '2.5px solid transparent',
              whiteSpace: 'nowrap', transition: 'all .15s',
            }}>
            {label}
          </button>
        ))}
      </nav>

      <main style={{ maxWidth: 860, margin: '32px auto', padding: '0 24px' }}>

        {/* ── Tab 0: DB 업로드 ── */}
        {tab === 0 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>회원 DB 업로드</h2>
            <p style={{ color: '#64748b', marginBottom: 24, fontSize: 14, lineHeight: 1.8 }}>
              엑셀 파일을 업로드하세요.<br />
              <b>@growv.com / @growv.kr</b> 내부 도메인과 중복 이메일은 자동 제외됩니다.
            </p>
            <UploadZone label="엑셀 파일 (.xlsx) 드롭 또는 클릭" accept=".xlsx,.xls"
              loading={uploading} inputRef={dbFileRef} onChange={handleDbUpload} icon="📊" />
            {uploadResult && (
              <div style={{
                marginTop: 16, padding: '14px 18px', background: '#f0fdf4',
                border: '1px solid #bbf7d0', borderRadius: 12,
                fontSize: 13, color: '#15803d', lineHeight: 1.8, whiteSpace: 'pre-line',
              }}>{uploadResult}</div>
            )}
            {dbStats && (
              <div style={{ marginTop: 28 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', marginBottom: 10 }}>현재 DB 현황</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
                  {([
                    { label: '전체', val: dbStats.total, color: '#64748b' },
                    { label: '💳 결제회원', val: dbStats.결제회원, color: '#e84393' },
                    { label: '📋 이메일+전화', val: dbStats['이메일+전화번호'], color: '#3d4fd7' },
                    { label: '✉️ 이메일만', val: dbStats.이메일만, color: '#8b5cf6' },
                  ]).map(s => (
                    <div key={s.label} style={{ ...cardStyle, padding: '18px 20px' }}>
                      <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, marginBottom: 6 }}>{s.label}</div>
                      <div style={{ fontSize: 30, fontWeight: 900, color: s.color }}>{s.val.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ marginTop: 28, textAlign: 'right' }}>
              <Btn primary onClick={() => setTab(1)}>다음: 메일 작성 →</Btn>
            </div>
          </div>
        )}

        {/* ── Tab 1: 메일 작성 ── */}
        {tab === 1 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>메일 작성</h2>

            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>캠페인 이름 (내부용)</div>
            <input value={campaignTitle} onChange={e => setCampaignTitle(e.target.value)}
              placeholder="예: 4월 뉴스레터"
              style={{
                width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0',
                borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none',
                marginBottom: 16, background: 'white',
              }} />

            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>메일 제목 *</div>
            <input value={subject} onChange={e => setSubject(e.target.value)}
              placeholder="예: 아이큐브에서 드리는 특별한 소식 🎉"
              style={{
                width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0',
                borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none',
                marginBottom: 20, background: 'white',
              }} />

            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>메일 본문 (HTML)</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {(['upload', 'editor'] as const).map((m) => (
                <button key={m} onClick={() => setHtmlMode(m)}
                  style={{
                    padding: '8px 16px',
                    border: `1.5px solid ${htmlMode === m ? '#3d4fd7' : '#e2e8f0'}`,
                    borderRadius: 8, fontSize: 13,
                    fontWeight: htmlMode === m ? 700 : 400,
                    background: htmlMode === m ? '#eff2ff' : 'white',
                    color: htmlMode === m ? '#3d4fd7' : '#64748b',
                    cursor: 'pointer',
                  }}>
                  {m === 'upload' ? '📁 HTML 파일 업로드' : '✏️ 직접 입력'}
                </button>
              ))}
            </div>

            {htmlMode === 'upload' ? (
              <UploadZone label="HTML 파일 드롭 또는 클릭 (최대 5MB)" accept=".html,.htm"
                loading={false} inputRef={htmlFileRef} onChange={handleHtmlUpload} icon="🌐" compact />
            ) : (
              <textarea value={htmlContent} onChange={e => setHtmlContent(e.target.value)}
                placeholder="<html>...</html>"
                style={{
                  width: '100%', minHeight: 280, padding: '14px 16px',
                  border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13,
                  fontFamily: 'monospace', resize: 'vertical', outline: 'none',
                  background: '#f8fafc', lineHeight: 1.6,
                }} />
            )}

            {htmlContent && (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  flex: 1, padding: '10px 14px', background: '#f0fdf4',
                  border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 13, color: '#15803d',
                }}>
                  ✅ HTML 로드됨 ({(htmlContent.length / 1024).toFixed(1)} KB)
                </div>
                <button onClick={() => setStep2Preview(true)}
                  style={{
                    padding: '10px 18px', background: '#eff2ff', color: '#3d4fd7',
                    border: '1.5px solid #c7d2fe', borderRadius: 8,
                    fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>
                  🔍 미리보기
                </button>
              </div>
            )}

            <div style={{ marginTop: 28, display: 'flex', justifyContent: 'space-between' }}>
              <Btn onClick={() => setTab(0)}>← 이전</Btn>
              <Btn primary onClick={() => {
                if (!subject.trim()) { showToast('메일 제목을 입력해주세요.', 'err'); return }
                if (!htmlContent.trim()) { showToast('메일 내용을 입력해주세요.', 'err'); return }
                setTab(2)
              }}>다음: 그룹 선택 →</Btn>
            </div>
          </div>
        )}

        {/* ── Tab 2: 그룹 + 수기 이메일 ── */}
        {tab === 2 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>수신 그룹 및 수신자 설정</h2>

            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>발송 그룹 선택</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 28 }}>
              {(Object.entries(CAT_LABELS) as [Category, string][]).map(([cat, label]) => {
                const active = selectedGroups.includes(cat)
                const count = dbStats?.[cat as keyof DBStats] as number | undefined
                return (
                  <button key={cat}
                    onClick={() => setSelectedGroups(prev =>
                      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
                    )}
                    style={{
                      padding: '16px', border: `2px solid ${active ? '#3d4fd7' : '#e2e8f0'}`,
                      borderRadius: 12, background: active ? '#eff2ff' : 'white',
                      cursor: 'pointer', textAlign: 'left', transition: 'all .15s',
                    }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: active ? '#3d4fd7' : '#374151', marginBottom: 4 }}>{label}</div>
                    {count !== undefined && <div style={{ fontSize: 13, color: '#94a3b8' }}>{count.toLocaleString()}명</div>}
                    {active && <div style={{ fontSize: 12, color: '#3d4fd7', marginTop: 4 }}>✓ 선택됨</div>}
                  </button>
                )
              })}
            </div>

            {/* 수기 이메일 */}
            <div style={{ ...cardStyle, marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>수기 이메일 추가</div>
              <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>
                쉼표(,), 세미콜론(;), 줄바꿈으로 여러 개 한번에 입력 가능
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <textarea value={manualInput}
                  onChange={e => { setManualInput(e.target.value); setManualError('') }}
                  placeholder={'email1@example.com\nemail2@example.com, email3@example.com'}
                  style={{
                    flex: 1, padding: '10px 14px', border: '1.5px solid #e2e8f0',
                    borderRadius: 8, fontSize: 13, fontFamily: 'inherit',
                    resize: 'vertical', minHeight: 80, outline: 'none', lineHeight: 1.6,
                  }} />
                <button onClick={addManualEmails}
                  style={{
                    padding: '0 18px', background: '#3d4fd7', color: 'white',
                    border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', alignSelf: 'stretch',
                  }}>추가</button>
              </div>
              {manualError && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 6 }}>⚠️ {manualError}</div>}
              {manualEmails.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                  {manualEmails.map(email => (
                    <span key={email} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '4px 10px', background: '#eff2ff',
                      border: '1px solid #c7d2fe', borderRadius: 20,
                      fontSize: 12, color: '#3d4fd7',
                    }}>
                      {email}
                      <button onClick={() => setManualEmails(prev => prev.filter(e => e !== email))}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14, padding: 0 }}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {recipientCount !== null && (
              <div style={{
                padding: '14px 18px', background: '#eff2ff', border: '1px solid #c7d2fe',
                borderRadius: 10, fontSize: 14, color: '#3d4fd7', fontWeight: 600, marginBottom: 20,
              }}>
                📬 총 <span style={{ fontSize: 22, fontWeight: 900 }}>{recipientCount.toLocaleString()}</span>명에게 발송됩니다
                {manualEmails.length > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 400, marginLeft: 8, color: '#6366f1' }}>
                    (그룹 {recipientCount - manualEmails.length}명 + 수기 {manualEmails.length}명)
                  </span>
                )}
              </div>
            )}

            <button onClick={() => setPreviewOpen(true)}
              style={{
                width: '100%', padding: '12px', border: '1.5px dashed #3d4fd7',
                borderRadius: 10, background: 'transparent', cursor: 'pointer',
                color: '#3d4fd7', fontWeight: 700, fontSize: 14, marginBottom: 28,
              }}>
              🔍 메일 최종 미리보기
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Btn onClick={() => setTab(1)}>← 이전</Btn>
              <Btn primary onClick={() => {
                if (selectedGroups.length === 0 && manualEmails.length === 0) {
                  showToast('그룹 또는 수신자를 추가해주세요.', 'err'); return
                }
                setTab(3)
              }}>다음: 발송 확인 →</Btn>
            </div>
          </div>
        )}

        {/* ── Tab 3: 발송 확인 ── */}
        {tab === 3 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>발송 확인</h2>
            <div style={{ ...cardStyle, marginBottom: 24 }}>
              {[
                { label: '캠페인 이름', value: campaignTitle || subject },
                { label: '메일 제목', value: subject },
                { label: '발송 그룹', value: selectedGroups.length > 0 ? selectedGroups.map(g => CAT_LABELS[g]).join(', ') : '(없음)' },
                { label: '수기 수신자', value: manualEmails.length > 0 ? `${manualEmails.length}명` : '(없음)' },
                { label: '총 수신자', value: `${(recipientCount ?? 0).toLocaleString()}명` },
                { label: '발신자', value: '아이큐브 <iquve@growv.com>' },
                { label: 'HTML 크기', value: `${(htmlContent.length / 1024).toFixed(1)} KB` },
                { label: '배치 발송', value: '30건씩 · 2초 간격 (스팸 방지)' },
              ].map(r => (
                <div key={r.label} style={{
                  display: 'flex', gap: 16, padding: '11px 0', borderBottom: '1px solid #f1f5f9',
                }}>
                  <div style={{ width: 120, fontSize: 13, color: '#94a3b8', flexShrink: 0 }}>{r.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{r.value}</div>
                </div>
              ))}
            </div>

            {!sendResult ? (
              <div style={{ textAlign: 'center' }}>
                <button onClick={handleSend} disabled={sending}
                  style={{
                    padding: '16px 48px',
                    background: sending ? '#94a3b8' : 'linear-gradient(135deg,#e84393,#f472b6)',
                    color: 'white', border: 'none', borderRadius: 14,
                    fontSize: 16, fontWeight: 900, cursor: sending ? 'not-allowed' : 'pointer',
                    boxShadow: sending ? 'none' : '0 4px 20px rgba(232,67,147,.4)',
                    display: 'inline-flex', alignItems: 'center', gap: 10,
                  }}>
                  {sending ? <><Spinner /> 발송 중...</> : '🚀 메일 발송 시작'}
                </button>
                <p style={{ marginTop: 12, fontSize: 13, color: '#94a3b8' }}>
                  발송 후 취소할 수 없습니다.
                </p>
              </div>
            ) : (
              <div style={{
                padding: '32px', background: '#f0fdf4',
                border: '1px solid #86efac', borderRadius: 16, textAlign: 'center',
              }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>🎉</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#15803d', marginBottom: 8 }}>발송 완료!</div>
                <div style={{ fontSize: 15, color: '#166534' }}>
                  총 <b>{sendResult.total.toLocaleString()}명</b> 중{' '}
                  <b style={{ color: '#15803d' }}>{sendResult.sentCount.toLocaleString()}명 성공</b>
                  {sendResult.failCount > 0 && <span style={{ color: '#dc2626' }}>, {sendResult.failCount}명 실패</span>}
                </div>
              </div>
            )}

            <div style={{ marginTop: 28, display: 'flex', justifyContent: 'space-between' }}>
              <Btn onClick={() => setTab(2)}>← 이전</Btn>
              {sendResult && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <Btn onClick={() => { setTab(4); loadCampaigns() }}>발송 이력 보기</Btn>
                  <Btn primary onClick={resetAll}>새 캠페인 만들기</Btn>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab 4: 발송 이력 ── */}
        {tab === 4 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>발송 이력</h2>
              <button onClick={loadCampaigns}
                style={{
                  padding: '8px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8,
                  background: 'white', fontSize: 13, cursor: 'pointer', color: '#64748b',
                }}>🔄 새로고침</button>
            </div>

            {loadingHistory ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                <Spinner /> 로딩 중...
              </div>
            ) : campaigns.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                <div>발송 이력이 없습니다.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {campaigns.map(c => (
                  <div key={c.id}
                    onClick={() => { setHistoryDetail(c); setHistoryPreview(false) }}
                    style={{
                      ...cardStyle, cursor: 'pointer', transition: 'all .15s',
                      borderLeft: `4px solid ${
                        c.status === 'done' ? '#22c55e'
                        : c.status === 'sending' ? '#f59e0b'
                        : c.status === 'error' ? '#ef4444' : '#e2e8f0'
                      }`,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,.1)')}
                    onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,.05)')}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                          <StatusBadge status={c.status} />
                          <span style={{ fontSize: 15, fontWeight: 800 }}>{c.title}</span>
                        </div>
                        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>제목: {c.subject}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {[
                            { bg: '#eff2ff', text: `📮 ${c.groups.join(', ')}` },
                            { bg: '#f0fdf4', text: `✅ ${c.sent_count.toLocaleString()}명 성공` },
                            ...(c.fail_count > 0 ? [{ bg: '#fef2f2', text: `❌ ${c.fail_count}명 실패` }] : []),
                            { bg: '#f8fafc', text: `👥 총 ${c.total_count.toLocaleString()}명` },
                          ].map(tag => (
                            <span key={tag.text} style={{
                              padding: '3px 10px', background: tag.bg,
                              borderRadius: 20, fontSize: 12, color: '#374151',
                            }}>{tag.text}</span>
                          ))}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>
                          {new Date(c.sent_at ?? c.created_at).toLocaleString('ko-KR', {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                          })}
                        </div>
                        <div style={{ fontSize: 12, color: '#3d4fd7', marginTop: 6, fontWeight: 600 }}>내용 보기 →</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Modal: 메일 작성 미리보기 ── */}
      {step2Preview && (
        <PreviewModal subject={subject} html={htmlContent} onClose={() => setStep2Preview(false)} />
      )}

      {/* ── Modal: 최종 미리보기 ── */}
      {previewOpen && (
        <PreviewModal subject={subject} html={htmlContent} onClose={() => setPreviewOpen(false)} />
      )}

      {/* ── Modal: 발송 이력 상세 ── */}
      {historyDetail && (
        <div onClick={() => setHistoryDetail(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}>
          <div onClick={e => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: 18, width: '100%', maxWidth: 760,
              maxHeight: '90vh', display: 'flex', flexDirection: 'column',
              overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,.3)',
            }}>
            {/* 헤더 */}
            <div style={{
              padding: '18px 24px', borderBottom: '1px solid #e2e8f0',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <StatusBadge status={historyDetail.status} />
                  <span style={{ fontSize: 16, fontWeight: 800 }}>{historyDetail.title}</span>
                </div>
                <div style={{ fontSize: 13, color: '#64748b' }}>제목: {historyDetail.subject}</div>
              </div>
              <button onClick={() => setHistoryDetail(null)}
                style={{
                  border: 'none', background: '#f1f5f9', borderRadius: 8,
                  width: 34, height: 34, cursor: 'pointer', fontSize: 20, color: '#64748b',
                }}>×</button>
            </div>

            {/* 발송 정보 */}
            <div style={{
              padding: '14px 24px', background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex', gap: 20, fontSize: 13, color: '#64748b', flexWrap: 'wrap',
            }}>
              <span>📮 그룹: <b style={{ color: '#1e293b' }}>{historyDetail.groups.join(', ')}</b></span>
              <span>👥 수신자: <b style={{ color: '#1e293b' }}>{historyDetail.total_count.toLocaleString()}명</b></span>
              <span>✅ 성공: <b style={{ color: '#15803d' }}>{historyDetail.sent_count.toLocaleString()}명</b></span>
              {historyDetail.fail_count > 0 && (
                <span>❌ 실패: <b style={{ color: '#dc2626' }}>{historyDetail.fail_count}명</b></span>
              )}
              <span>📅 {new Date(historyDetail.sent_at ?? historyDetail.created_at).toLocaleString('ko-KR')}</span>
            </div>

            {/* 미리보기 토글 */}
            <div style={{ padding: '14px 24px', borderBottom: historyPreview ? '1px solid #e2e8f0' : 'none' }}>
              <button onClick={() => setHistoryPreview(p => !p)}
                style={{
                  padding: '9px 18px', border: '1.5px solid #c7d2fe',
                  borderRadius: 8, background: historyPreview ? '#eff2ff' : 'white',
                  color: '#3d4fd7', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}>
                {historyPreview ? '▲ 메일 내용 닫기' : '▼ 발송된 메일 내용 보기'}
              </button>
            </div>

            {historyPreview && (
              <div style={{ flex: 1, overflow: 'auto' }}>
                <iframe
                  srcDoc={historyDetail.html_content}
                  style={{ width: '100%', height: '100%', minHeight: 480, border: 'none' }}
                  title="발송 메일 미리보기"
                  sandbox="allow-same-origin"
                />
              </div>
            )}

            {!historyPreview && (
              <div style={{ padding: '24px', color: '#94a3b8', fontSize: 14, textAlign: 'center' }}>
                위 버튼을 눌러 발송된 메일 내용을 확인하세요
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
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
        @keyframes fadeIn { from { opacity:0;transform:translateY(8px); } to { opacity:1;transform:none; } }
      `}</style>
    </div>
  )
}

// ─── Sub Components ───────────────────────────────────────────────────────────

function PreviewModal({ subject, html, onClose }: { subject: string; html: string; onClose: () => void }) {
  return (
    <div onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 18, width: '100%', maxWidth: 740,
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,.3)',
        }}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>미리보기</div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{subject || '(제목 없음)'}</div>
          </div>
          <button onClick={onClose}
            style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', fontSize: 20, color: '#64748b' }}>×</button>
        </div>
        <div style={{ padding: '10px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 13, color: '#64748b' }}>
          <b>보낸 사람:</b> 아이큐브 &lt;iquve@growv.com&gt;&nbsp;&nbsp;
          <b>제목:</b> {subject}
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <iframe
            srcDoc={html || '<p style="padding:20px;color:#888">HTML 내용이 없습니다.</p>'}
            style={{ width: '100%', height: '100%', minHeight: 520, border: 'none' }}
            title="메일 미리보기"
            sandbox="allow-same-origin"
          />
        </div>
      </div>
    </div>
  )
}

function Btn({ children, primary, onClick, disabled }: {
  children: React.ReactNode; primary?: boolean; onClick?: () => void; disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        padding: '10px 24px', border: primary ? 'none' : '1.5px solid #e2e8f0',
        borderRadius: 10, fontSize: 14, fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: primary ? '#3d4fd7' : 'white',
        color: primary ? 'white' : '#374151',
        opacity: disabled ? .5 : 1, transition: 'all .15s',
      }}>
      {children}
    </button>
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
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: s.bg, color: s.color,
    }}>{s.label}</span>
  )
}

function UploadZone({ label, accept, loading, inputRef, onChange, icon, compact }: {
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
      opacity: loading ? .6 : 1, gap: 8,
    }}>
      <input ref={inputRef} type="file" accept={accept} style={{ display: 'none' }}
        onChange={onChange} disabled={loading} />
      <div style={{ fontSize: compact ? 28 : 40 }}>{loading ? '⏳' : icon}</div>
      <div style={{ fontSize: 14, color: '#6366f1', fontWeight: 600 }}>{loading ? '업로드 중...' : label}</div>
    </label>
  )
}

function Spinner() {
  return (
    <span style={{
      display: 'inline-block', width: 16, height: 16,
      border: '2px solid rgba(255,255,255,.4)', borderTopColor: 'white',
      borderRadius: '50%', animation: 'spin .7s linear infinite',
    }} />
  )
}
