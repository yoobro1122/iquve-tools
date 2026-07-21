"use client";

import { useState, useEffect } from "react";

type Tab = "db" | "youtube" | "instagram" | "naver" | "settings";

interface YoutubeResult {
  channelId: string;
  title: string;
  description: string;
  subscriberCount: number;
  videoCount: number;
  thumbnail: string;
  lastUploadAt: string | null;
}

interface DiscoverResult {
  username: string;
  name: string | null;
  biography: string | null;
  followersCount: number;
  mediaCount: number;
  isVerified: boolean;
  publicEmail: string | null;
  publicPhoneNumber: string | null;
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
  source_permalink: string | null;
}

const STATUS_OPTIONS = ["연락전", "협의중", "완료", "보류"];

// 네이버 블로그 URL(https://blog.naver.com/{네이버ID}/{게시물번호})에서
// 네이버ID를 뽑아 {아이디}@naver.com 형태로 이메일을 유추합니다.
// 네이버 계정은 기본적으로 아이디와 동일한 @naver.com 메일을 갖고 있어서
// 실제 사용 여부와 별개로 유효한 컨택 채널일 가능성이 높습니다.
function deriveNaverEmail(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)/);
  return match ? `${match[1]}@naver.com` : null;
}

// 배포 확인용 버전 표시 - 코드가 바뀔 때마다 이 값을 올려주세요.
const APP_VERSION =
  "v3.0.0 (2026-07-21) - 인스타그램 HikerAPI로 전환 (App Review 불필요)";

export default function InfluencerToolPage() {
  const [tab, setTab] = useState<Tab>("db");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold">인플루언서 발굴 &amp; 관리</h1>
        <p className="text-sm text-slate-500">아이큐브 제휴 후보 검색 · 등록 · 진행상태 관리</p>
        <p className="text-xs text-slate-300 mt-1">{APP_VERSION}</p>
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
    key: "hikerapi_access_key",
    label: "인스타그램 - HikerAPI Access Key",
    helper: "hikerapi.com에서 발급한 토큰. 지금 인스타 검색은 이 키로 동작해요.",
  },
  {
    key: "ig_access_token",
    label: "인스타그램 - Meta Access Token (App Review 승인 후용, 선택)",
    helper: "Meta for Developers에서 발급한 장기 액세스 토큰 (현재 미사용)",
  },
  {
    key: "ig_business_account_id",
    label: "인스타그램 - Meta Business Account ID (App Review 승인 후용, 선택)",
    helper: "본인 소유 비즈니스/크리에이터 계정의 instagram_business_account.id (현재 미사용)",
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
  const [maxResults, setMaxResults] = useState(25);
  const [sort, setSort] = useState("subscribers_desc");
  const [results, setResults] = useState<YoutubeResult[]>([]);
  const [resultMeta, setResultMeta] = useState<{
    requestedCount: number;
    returnedCount: number;
    afterFilterCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const search = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/youtube/search?q=${encodeURIComponent(
          query
        )}&minSubscribers=${minSubs}&maxResults=${maxResults}&sort=${sort}`
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data.results);
      setResultMeta({
        requestedCount: data.requestedCount,
        returnedCount: data.returnedCount,
        afterFilterCount: data.afterFilterCount,
      });
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
          source_permalink: `https://www.youtube.com/channel/${r.channelId}`,
          memo: r.description || null,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSavedIds((prev) => new Set(prev).add(r.channelId));
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
        <div className="w-32">
          <label className="block text-xs text-slate-500 mb-1">가져올 개수</label>
          <input
            type="number"
            max={50}
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
            value={maxResults}
            onChange={(e) => setMaxResults(Math.min(Number(e.target.value), 50))}
          />
        </div>
        <div className="w-40">
          <label className="block text-xs text-slate-500 mb-1">정렬</label>
          <select
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="subscribers_desc">구독자 많은순</option>
            <option value="subscribers_asc">구독자 적은순</option>
            <option value="recent_upload">최근 업로드순</option>
          </select>
        </div>
        <button
          onClick={search}
          disabled={loading}
          className="bg-slate-900 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
        >
          {loading ? "검색 중..." : "검색"}
        </button>
      </div>

      {resultMeta && (
        <p className="text-xs text-slate-400">
          유튜브에 {resultMeta.requestedCount}개 요청 → {resultMeta.returnedCount}개 응답 →
          최소 구독자수 조건 적용 후 {resultMeta.afterFilterCount}개 표시 중
          {resultMeta.returnedCount === resultMeta.requestedCount &&
            " (더 있을 수 있어요 — '가져올 개수'를 늘려서 다시 검색해보세요, 최대 50)"}
        </p>
      )}

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
              <a
                href={`https://www.youtube.com/channel/${r.channelId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-sm text-slate-900 hover:underline"
              >
                {r.title} ↗
              </a>
              <div className="text-xs text-slate-500">
                구독자 {r.subscriberCount.toLocaleString()}명 · 영상 {r.videoCount}개
                {r.lastUploadAt &&
                  ` · 최근 업로드 ${new Date(r.lastUploadAt).toLocaleDateString("ko-KR")}`}
              </div>
              {r.description && (
                <div className="text-xs text-slate-400 mt-1 line-clamp-2">{r.description}</div>
              )}
            </div>
            <button
              onClick={() => saveToDb(r)}
              disabled={saving === r.channelId || savedIds.has(r.channelId)}
              className={`text-xs border rounded px-3 py-1.5 ${
                savedIds.has(r.channelId)
                  ? "border-emerald-300 text-emerald-600 bg-emerald-50"
                  : "border-slate-300 hover:bg-slate-50"
              }`}
            >
              {saving === r.channelId
                ? "저장 중..."
                : savedIds.has(r.channelId)
                ? "등록 완료 ✓"
                : "DB에 등록"}
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
  const [usernameInput, setUsernameInput] = useState("");
  const [minFollowers, setMinFollowers] = useState(5000);
  const [discoverResults, setDiscoverResults] = useState<DiscoverResult[]>([]);
  const [discoverErrors, setDiscoverErrors] = useState<
    { username: string; reason: string }[]
  >([]);
  const [filteredByMinFollowers, setFilteredByMinFollowers] = useState<string[]>([]);
  const [alreadyInDb, setAlreadyInDb] = useState<string[]>([]);
  const [loadingDiscover, setLoadingDiscover] = useState(false);
  const [savedUsernames, setSavedUsernames] = useState<Set<string>>(new Set());

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
        body: JSON.stringify({ usernames, minFollowers }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDiscoverResults(data.results);
      setDiscoverErrors(data.errors ?? []);
      setFilteredByMinFollowers(data.filteredByMinFollowers ?? []);
      setAlreadyInDb(data.alreadyInDb ?? []);
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
          source_permalink: `https://www.instagram.com/${r.username}/`,
          memo: r.biography || null,
          contact_dm: r.publicEmail || r.publicPhoneNumber || undefined,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSavedUsernames((prev) => new Set(prev).add(r.username));
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-8">
      <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded p-2">
        HikerAPI(서드파티)로 공개 프로필을 조회해요. Meta 공식 App Review 없이 바로 작동해요.
        해시태그로 계정을 자동 발견하는 기능은 아직 없어서, username을 알고 있는 계정 위주로
        입력해주세요.
      </p>

      <section className="space-y-3">
        <h2 className="font-medium text-sm">username 일괄 조회 (HikerAPI)</h2>
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
                <a
                  href={`https://www.instagram.com/${r.username}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-sm text-slate-900 hover:underline"
                >
                  @{r.username} {r.name && `(${r.name})`} {r.isVerified && "✔️"} ↗
                </a>
                <div className="text-xs text-slate-500">
                  팔로워 {r.followersCount.toLocaleString()}명 · 게시물 {r.mediaCount}개
                  {(r.publicEmail || r.publicPhoneNumber) && (
                    <span className="text-emerald-600">
                      {" "}
                      · 공개 컨택: {r.publicEmail ?? r.publicPhoneNumber}
                    </span>
                  )}
                </div>
                {r.biography && (
                  <div className="text-xs text-slate-400 mt-1 line-clamp-2">{r.biography}</div>
                )}
              </div>
              <button
                onClick={() => saveToDb(r)}
                disabled={savedUsernames.has(r.username)}
                className={`text-xs border rounded px-3 py-1.5 ${
                  savedUsernames.has(r.username)
                    ? "border-emerald-300 text-emerald-600 bg-emerald-50"
                    : "border-slate-300 hover:bg-slate-50"
                }`}
              >
                {savedUsernames.has(r.username) ? "등록 완료 ✓" : "DB에 등록"}
              </button>
            </div>
          ))}
        </div>

        {discoverErrors.length > 0 && (
          <div className="border border-red-200 bg-red-50 rounded p-3">
            <p className="text-xs font-medium text-red-700 mb-1">
              조회 실패 {discoverErrors.length}건
            </p>
            <ul className="text-xs text-red-600 space-y-0.5">
              {discoverErrors.map((e) => (
                <li key={e.username}>
                  @{e.username} — {e.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {filteredByMinFollowers.length > 0 && (
          <p className="text-xs text-slate-400">
            최소 팔로워수 미달로 제외됨: {filteredByMinFollowers.map((u) => `@${u}`).join(", ")}
          </p>
        )}

        {alreadyInDb.length > 0 && (
          <p className="text-xs text-slate-400">
            이미 DB에 등록되어 있어 목록에서 제외됨: {alreadyInDb.map((u) => `@${u}`).join(", ")}
          </p>
        )}
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
  const [savedLinks, setSavedLinks] = useState<Set<string>>(new Set());

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
          memo: r.description || null,
          contact_dm: deriveNaverEmail(r.bloggerlink) ?? deriveNaverEmail(r.link),
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSavedLinks((prev) => new Set(prev).add(r.bloggerlink + r.link));
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
                {deriveNaverEmail(r.bloggerlink) && (
                  <div className="text-xs text-slate-400 mt-1">
                    예상 컨택: {deriveNaverEmail(r.bloggerlink)} (등록 시 자동 입력)
                  </div>
                )}
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
                  disabled={savedLinks.has(r.bloggerlink + r.link)}
                  className={`text-xs border rounded px-3 py-1.5 whitespace-nowrap ${
                    savedLinks.has(r.bloggerlink + r.link)
                      ? "border-emerald-300 text-emerald-600 bg-emerald-50"
                      : "border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {savedLinks.has(r.bloggerlink + r.link) ? "등록 완료 ✓" : "DB에 등록"}
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
  const [expandedMemoIds, setExpandedMemoIds] = useState<Set<string>>(new Set());

  const toggleMemo = (id: string) => {
    setExpandedMemoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
            <th className="p-2 whitespace-nowrap">플랫폼</th>
            <th className="p-2 whitespace-nowrap">계정</th>
            <th className="p-2 whitespace-nowrap">팔로워/구독자</th>
            <th className="p-2 whitespace-nowrap">진행상태</th>
            <th className="p-2 whitespace-nowrap">컨택포인트</th>
            <th className="p-2 whitespace-nowrap">메모</th>
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
              <td className="p-2">
                {r.source_permalink ? (
                  <a
                    href={r.source_permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-900 hover:underline"
                  >
                    {r.display_name ?? r.handle} ↗
                  </a>
                ) : (
                  <span>{r.display_name ?? r.handle}</span>
                )}
              </td>
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
              <td className="p-2 max-w-[220px]">
                {editingId === r.id ? (
                  <input
                    type="text"
                    value={draft.memo}
                    placeholder="메모"
                    className="w-40 border border-slate-300 rounded px-2 py-1 text-xs focus:border-slate-400"
                    onChange={(e) => setDraft((d) => ({ ...d, memo: e.target.value }))}
                  />
                ) : r.memo ? (
                  <div>
                    <span
                      className={`text-xs text-slate-500 ${
                        expandedMemoIds.has(r.id) ? "" : "line-clamp-1"
                      }`}
                    >
                      {r.memo}
                    </span>
                    {r.memo.length > 20 && (
                      <button
                        onClick={() => toggleMemo(r.id)}
                        className="block text-xs text-slate-400 hover:underline mt-0.5"
                      >
                        {expandedMemoIds.has(r.id) ? "접기" : "더보기"}
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-slate-500">-</span>
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
