"use client";

import { useState, useEffect } from "react";

type Tab = "db" | "youtube" | "instagram" | "naver" | "settings";

interface YoutubeResult {
  channelId: string;
  title: string;
  subscriberCount: number;
  videoCount: number;
  lastUploadAt: string | null;
  thumbnail: string;
}

interface HashtagMedia {
  id: string;
  permalink: string;
  timestamp: string;
  likeCount: number;
  commentsCount: number;
  caption: string | null;
}

interface DiscoverResult {
  username: string;
  name: string | null;
  followersCount: number;
  lastMediaTimestamp: string | null;
  isRecentlyActive: boolean;
}

interface NaverBlogResult {
  title: string;
  link: string;
  description: string;
  bloggername: string;
  bloggerlink: string;
  postdate: string;
}

interface InfluencerRow {
  id: string;
  platform: string;
  handle: string;
  display_name: string | null;
  followers_count: number | null;
  category_tags: string[];
  contact_dm: string | null;
  partnership_status: string;
  memo: string | null;
}

const STATUS_OPTIONS = ["연락전", "협의중", "완료", "보류"];

export default function InfluencerToolPage() {
  const [tab, setTab] = useState<Tab>("db");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold">인플루언서 발굴 &amp; 관리</h1>
        <p className="text-sm text-slate-500">아이큐브 제휴 후보 검색 · 등록 · 진행상태 관리</p>
      </header>

      <nav className="flex gap-1 border-b border-slate-200 bg-white px-6">
        {[
          { key: "db", label: "DB 관리" },
          { key: "youtube", label: "유튜브 검색" },
          { key: "instagram", label: "인스타 발견" },
          { key: "naver", label: "네이버 블로그" },
          { key: "settings", label: "설정" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as Tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              tab === t.key
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="p-6 max-w-5xl mx-auto">
        {tab === "db" && <DbTab />}
        {tab === "youtube" && <YoutubeTab />}
        {tab === "instagram" && <InstagramTab />}
        {tab === "naver" && <NaverTab />}
        {tab === "settings" && <SettingsTab />}
      </main>
    </div>
  );
}

interface ConfigStatus {
  isSet: boolean;
  updatedAt: string | null;
}

const SETTINGS_FIELDS: { key: string; label: string; helper: string }[] = [
  {
    key: "youtube_api_key",
    label: "유튜브 Data API 키",
    helper: "Google Cloud Console에서 발급한 API 키",
  },
  {
    key: "ig_access_token",
    label: "인스타그램 Access Token",
    helper: "Meta for Developers에서 발급한 장기 액세스 토큰",
  },
  {
    key: "ig_business_account_id",
    label: "인스타그램 Business Account ID",
    helper: "본인 소유 비즈니스/크리에이터 계정의 instagram_business_account.id",
  },
  {
    key: "naver_client_id",
    label: "네이버 Client ID",
    helper: "네이버 개발자센터 애플리케이션의 Client ID",
  },
  {
    key: "naver_client_secret",
    label: "네이버 Client Secret",
    helper: "네이버 개발자센터 애플리케이션의 Client Secret",
  },
];

function SettingsTab() {
  const [statuses, setStatuses] = useState<Record<string, ConfigStatus>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStatuses(data.statuses);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (key: string) => {
    const value = inputs[key];
    if (!value) {
      alert("값을 입력해주세요.");
      return;
    }
    setSaving(key);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setInputs((prev) => ({ ...prev, [key]: "" }));
      await load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-xs text-slate-500">
        여기서 입력한 키는 Supabase의 api_config 테이블에 저장되고, 서버(API 라우트)에서만
        읽어서 사용합니다. 브라우저에는 저장 여부와 최종 수정일만 표시되고, 저장된 값 자체는
        다시 화면에 노출되지 않습니다.
      </p>

      {loading ? (
        <p className="text-sm text-slate-400">불러오는 중...</p>
      ) : (
        <div className="space-y-4">
          {SETTINGS_FIELDS.map((f) => {
            const status = statuses[f.key];
            return (
              <div key={f.key} className="border border-slate-200 rounded p-4 bg-white">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium">{f.label}</label>
                  {status?.isSet ? (
                    <span className="text-xs text-emerald-600">
                      저장됨
                      {status.updatedAt &&
                        ` · ${new Date(status.updatedAt).toLocaleDateString("ko-KR")}`}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">미설정</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mb-2">{f.helper}</p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    className="flex-1 border border-slate-300 rounded px-3 py-2 text-sm"
                    placeholder={status?.isSet ? "새 값으로 교체하려면 입력" : "값 입력"}
                    value={inputs[f.key] ?? ""}
                    onChange={(e) =>
                      setInputs((prev) => ({ ...prev, [f.key]: e.target.value }))
                    }
                  />
                  <button
                    onClick={() => save(f.key)}
                    disabled={saving === f.key}
                    className="bg-slate-900 text-white rounded px-4 py-2 text-sm disabled:opacity-50 whitespace-nowrap"
                  >
                    {saving === f.key ? "저장 중..." : "저장"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function YoutubeTab() {
  const [query, setQuery] = useState("육아 그림책");
  const [minSubs, setMinSubs] = useState(1000);
  const [results, setResults] = useState<YoutubeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const search = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/youtube/search?q=${encodeURIComponent(query)}&minSubscribers=${minSubs}`
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data.results);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveToDb = async (r: YoutubeResult) => {
    setSaving(r.channelId);
    try {
      const res = await fetch("/api/influencers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "youtube",
          handle: r.channelId,
          display_name: r.title,
          followers_count: r.subscriberCount,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      alert(`${r.title} 저장 완료`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-xs text-slate-500 mb-1">검색 키워드</label>
          <input
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="예: 육아 그림책, 아이 영어책"
          />
        </div>
        <div className="w-40">
          <label className="block text-xs text-slate-500 mb-1">최소 구독자수</label>
          <input
            type="number"
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
            value={minSubs}
            onChange={(e) => setMinSubs(Number(e.target.value))}
          />
        </div>
        <button
          onClick={search}
          disabled={loading}
          className="bg-slate-900 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
        >
          {loading ? "검색 중..." : "검색"}
        </button>
      </div>

      <div className="space-y-2">
        {results.map((r) => (
          <div
            key={r.channelId}
            className="flex items-center gap-3 border border-slate-200 rounded p-3 bg-white"
          >
            {r.thumbnail && (
              <img src={r.thumbnail} alt="" className="w-10 h-10 rounded-full" />
            )}
            <div className="flex-1">
              <div className="font-medium text-sm">{r.title}</div>
              <div className="text-xs text-slate-500">
                구독자 {r.subscriberCount.toLocaleString()}명 · 영상 {r.videoCount}개
                {r.lastUploadAt &&
                  ` · 최근 업로드 ${new Date(r.lastUploadAt).toLocaleDateString("ko-KR")}`}
              </div>
            </div>
            <button
              onClick={() => saveToDb(r)}
              disabled={saving === r.channelId}
              className="text-xs border border-slate-300 rounded px-3 py-1.5 hover:bg-slate-50"
            >
              {saving === r.channelId ? "저장 중..." : "DB에 등록"}
            </button>
          </div>
        ))}
        {results.length === 0 && !loading && (
          <p className="text-sm text-slate-400">검색 결과가 여기 표시됩니다.</p>
        )}
      </div>
    </div>
  );
}

function InstagramTab() {
  const [hashtag, setHashtag] = useState("육아");
  const [media, setMedia] = useState<HashtagMedia[]>([]);
  const [usernameInput, setUsernameInput] = useState("");
  const [minFollowers, setMinFollowers] = useState(5000);
  const [activeWithinDays, setActiveWithinDays] = useState(7);
  const [discoverResults, setDiscoverResults] = useState<DiscoverResult[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [loadingDiscover, setLoadingDiscover] = useState(false);

  const searchHashtag = async () => {
    setLoadingMedia(true);
    try {
      const res = await fetch(`/api/instagram/hashtag-media?tag=${encodeURIComponent(hashtag)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMedia(data.results);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoadingMedia(false);
    }
  };

  const runDiscover = async () => {
    const usernames = usernameInput
      .split(/[\n,]/)
      .map((u) => u.trim().replace(/^@/, ""))
      .filter(Boolean);
    if (usernames.length === 0) {
      alert("username을 한 줄에 하나씩 입력해주세요.");
      return;
    }
    setLoadingDiscover(true);
    try {
      const res = await fetch("/api/instagram/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames, minFollowers, activeWithinDays }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDiscoverResults(data.results);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoadingDiscover(false);
    }
  };

  const saveToDb = async (r: DiscoverResult) => {
    try {
      const res = await fetch("/api/influencers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "instagram",
          handle: r.username,
          display_name: r.name,
          followers_count: r.followersCount,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      alert(`@${r.username} 저장 완료`);
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-8">
      {/* 1단계: 해시태그로 게시물 발견 */}
      <section className="space-y-3">
        <h2 className="font-medium text-sm">1단계 · 해시태그로 게시물 찾기</h2>
        <p className="text-xs text-slate-500">
          Meta 정책상 게시물 소유 계정명(username)은 API로 제공되지 않습니다. 아래 permalink를
          열어 계정을 확인한 뒤, 2단계에 username을 입력하세요.
        </p>
        <div className="flex gap-2">
          <input
            className="border border-slate-300 rounded px-3 py-2 text-sm w-48"
            value={hashtag}
            onChange={(e) => setHashtag(e.target.value)}
            placeholder="예: 육아"
          />
          <button
            onClick={searchHashtag}
            disabled={loadingMedia}
            className="bg-slate-900 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
          >
            {loadingMedia ? "조회 중..." : "게시물 조회"}
          </button>
        </div>
        <div className="space-y-1.5">
          {media.map((m) => (
            <a
              key={m.id}
              href={m.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="block border border-slate-200 rounded p-2.5 bg-white text-xs hover:bg-slate-50"
            >
              <span className="text-slate-900 font-medium">{m.permalink}</span>
              <span className="text-slate-500">
                {" "}
                · 좋아요 {m.likeCount} · 댓글 {m.commentsCount} ·{" "}
                {new Date(m.timestamp).toLocaleDateString("ko-KR")}
              </span>
            </a>
          ))}
        </div>
      </section>

      {/* 2단계: username 일괄 조회 */}
      <section className="space-y-3 border-t border-slate-200 pt-6">
        <h2 className="font-medium text-sm">2단계 · username 일괄 조회 (자동 필터링)</h2>
        <textarea
          className="w-full border border-slate-300 rounded px-3 py-2 text-sm h-24"
          placeholder="username을 한 줄에 하나씩 입력 (예: iquve_official)"
          value={usernameInput}
          onChange={(e) => setUsernameInput(e.target.value)}
        />
        <div className="flex gap-2 items-end">
          <div className="w-40">
            <label className="block text-xs text-slate-500 mb-1">최소 팔로워수</label>
            <input
              type="number"
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
              value={minFollowers}
              onChange={(e) => setMinFollowers(Number(e.target.value))}
            />
          </div>
          <div className="w-40">
            <label className="block text-xs text-slate-500 mb-1">최근 활동 기준(일)</label>
            <input
              type="number"
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
              value={activeWithinDays}
              onChange={(e) => setActiveWithinDays(Number(e.target.value))}
            />
          </div>
          <button
            onClick={runDiscover}
            disabled={loadingDiscover}
            className="bg-slate-900 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
          >
            {loadingDiscover ? "조회 중..." : "일괄 조회"}
          </button>
        </div>

        <div className="space-y-1.5">
          {discoverResults.map((r) => (
            <div
              key={r.username}
              className="flex items-center gap-3 border border-slate-200 rounded p-3 bg-white"
            >
              <div className="flex-1">
                <div className="font-medium text-sm">
                  @{r.username} {r.name && `(${r.name})`}
                </div>
                <div className="text-xs text-slate-500">
                  팔로워 {r.followersCount.toLocaleString()}명 ·{" "}
                  {r.isRecentlyActive ? (
                    <span className="text-emerald-600">최근 활동 있음</span>
                  ) : (
                    <span className="text-slate-400">최근 활동 없음</span>
                  )}
                  {r.lastMediaTimestamp &&
                    ` · 마지막 게시 ${new Date(r.lastMediaTimestamp).toLocaleDateString("ko-KR")}`}
                </div>
              </div>
              <button
                onClick={() => saveToDb(r)}
                className="text-xs border border-slate-300 rounded px-3 py-1.5 hover:bg-slate-50"
              >
                DB에 등록
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function NaverTab() {
  const [query, setQuery] = useState("육아 그림책 추천");
  const [withinDays, setWithinDays] = useState(7);
  const [dedupe, setDedupe] = useState(true);
  const [results, setResults] = useState<NaverBlogResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [followerInputs, setFollowerInputs] = useState<Record<string, string>>({});

  const search = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: query,
        withinDays: String(withinDays),
        dedupe: String(dedupe),
      });
      const res = await fetch(`/api/naver/search?${params.toString()}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data.results);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveToDb = async (r: NaverBlogResult) => {
    const followerRaw = followerInputs[r.bloggerlink];
    try {
      const res = await fetch("/api/influencers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "naver_blog",
          handle: r.bloggerlink,
          display_name: r.bloggername,
          followers_count: followerRaw ? Number(followerRaw) : null,
          source_permalink: r.link,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      alert(`${r.bloggername} 저장 완료`);
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        네이버 검색 오픈API 기반 키워드 검색입니다. 이웃수·방문자수는 공식 API에 없어서
        bloggerlink를 열어 직접 확인한 뒤, 등록 전 이웃수 칸에 입력해주세요 (선택 사항).
      </p>
      <div className="flex gap-2 items-end flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-slate-500 mb-1">검색 키워드</label>
          <input
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="예: 육아 그림책 추천, 유아 영어전집"
          />
        </div>
        <div className="w-36">
          <label className="block text-xs text-slate-500 mb-1">최근 활동(일)</label>
          <input
            type="number"
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
            value={withinDays}
            onChange={(e) => setWithinDays(Number(e.target.value))}
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 pb-2">
          <input
            type="checkbox"
            checked={dedupe}
            onChange={(e) => setDedupe(e.target.checked)}
          />
          블로거당 1건만 표시
        </label>
        <button
          onClick={search}
          disabled={loading}
          className="bg-slate-900 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
        >
          {loading ? "검색 중..." : "검색"}
        </button>
      </div>

      <div className="space-y-2">
        {results.map((r) => (
          <div key={r.bloggerlink + r.link} className="border border-slate-200 rounded p-3 bg-white">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <a
                  href={r.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-sm text-slate-900 hover:underline"
                >
                  {r.title}
                </a>
                <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{r.description}</div>
                <div className="text-xs text-slate-400 mt-1">
                  <a
                    href={r.bloggerlink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {r.bloggername}
                  </a>
                  {" · "}
                  {r.postdate.slice(0, 4)}-{r.postdate.slice(4, 6)}-{r.postdate.slice(6, 8)}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number"
                  placeholder="이웃수"
                  className="w-20 border border-slate-300 rounded px-2 py-1.5 text-xs"
                  value={followerInputs[r.bloggerlink] ?? ""}
                  onChange={(e) =>
                    setFollowerInputs((prev) => ({ ...prev, [r.bloggerlink]: e.target.value }))
                  }
                />
                <button
                  onClick={() => saveToDb(r)}
                  className="text-xs border border-slate-300 rounded px-3 py-1.5 hover:bg-slate-50 whitespace-nowrap"
                >
                  DB에 등록
                </button>
              </div>
            </div>
          </div>
        ))}
        {results.length === 0 && !loading && (
          <p className="text-sm text-slate-400">검색 결과가 여기 표시됩니다.</p>
        )}
      </div>
    </div>
  );
}

function DbTab() {
  const [rows, setRows] = useState<InfluencerRow[]>([]);
  const [platform, setPlatform] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    partnership_status: string;
    contact_dm: string;
    memo: string;
  }>({ partnership_status: "", contact_dm: "", memo: "" });

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (platform) params.set("platform", platform);
      if (status) params.set("status", status);
      const res = await fetch(`/api/influencers?${params.toString()}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRows(data.results);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startEdit = (r: InfluencerRow) => {
    setEditingId(r.id);
    setDraft({
      partnership_status: r.partnership_status,
      contact_dm: r.contact_dm ?? "",
      memo: r.memo ?? "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (id: string) => {
    try {
      const res = await fetch(`/api/influencers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...draft } : r)));
      setEditingId(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await fetch(`/api/influencers/${id}`, { method: "DELETE" });
    setRows((prev) => prev.filter((r) => r.id !== id));
    if (editingId === id) setEditingId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-1">플랫폼</label>
          <select
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            <option value="">전체</option>
            <option value="youtube">유튜브</option>
            <option value="instagram">인스타그램</option>
            <option value="naver_blog">네이버 블로그</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">진행상태</label>
          <select
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">전체</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="bg-slate-900 text-white rounded px-4 py-2 text-sm"
        >
          필터 적용
        </button>
        <a
          href={`/api/influencers/export?${new URLSearchParams({
            ...(platform ? { platform } : {}),
            ...(status ? { status } : {}),
          }).toString()}`}
          className="border border-slate-300 rounded px-4 py-2 text-sm hover:bg-slate-50"
        >
          엑셀 다운로드
        </a>
      </div>

      <table className="w-full text-sm border border-slate-200 rounded overflow-hidden bg-white">
        <thead className="bg-slate-100 text-left text-xs text-slate-500">
          <tr>
            <th className="p-2">플랫폼</th>
            <th className="p-2">계정</th>
            <th className="p-2">팔로워/구독자</th>
            <th className="p-2">진행상태</th>
            <th className="p-2">컨택포인트</th>
            <th className="p-2">메모</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-100">
              <td className="p-2">
                {r.platform === "youtube"
                  ? "유튜브"
                  : r.platform === "instagram"
                  ? "인스타"
                  : "네이버"}
              </td>
              <td className="p-2">{r.display_name ?? r.handle}</td>
              <td className="p-2">{r.followers_count?.toLocaleString() ?? "-"}</td>
              <td className="p-2">
                {editingId === r.id ? (
                  <select
                    className="border border-slate-300 rounded px-2 py-1 text-xs"
                    value={draft.partnership_status}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, partnership_status: e.target.value }))
                    }
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs">{r.partnership_status}</span>
                )}
              </td>
              <td className="p-2">
                {editingId === r.id ? (
                  <input
                    type="text"
                    value={draft.contact_dm}
                    placeholder="DM, 이메일, 오픈채팅 등"
                    className="w-40 border border-slate-300 rounded px-2 py-1 text-xs focus:border-slate-400"
                    onChange={(e) => setDraft((d) => ({ ...d, contact_dm: e.target.value }))}
                  />
                ) : (
                  <span className="text-xs text-slate-600">{r.contact_dm ?? "-"}</span>
                )}
              </td>
              <td className="p-2">
                {editingId === r.id ? (
                  <input
                    type="text"
                    value={draft.memo}
                    placeholder="메모"
                    className="w-40 border border-slate-300 rounded px-2 py-1 text-xs focus:border-slate-400"
                    onChange={(e) => setDraft((d) => ({ ...d, memo: e.target.value }))}
                  />
                ) : (
                  <span className="text-xs text-slate-500">{r.memo ?? "-"}</span>
                )}
              </td>
              <td className="p-2 whitespace-nowrap">
                {editingId === r.id ? (
                  <>
                    <button
                      onClick={() => saveEdit(r.id)}
                      className="text-xs text-emerald-600 hover:underline mr-2"
                    >
                      저장
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="text-xs text-slate-400 hover:underline"
                    >
                      취소
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => startEdit(r)}
                      className="text-xs text-slate-600 hover:underline mr-2"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => remove(r.id)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      삭제
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="p-4 text-center text-slate-400 text-xs">
                등록된 인플루언서가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
