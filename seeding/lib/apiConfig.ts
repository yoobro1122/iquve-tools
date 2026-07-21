import { getSupabaseServer } from "./supabase";

// 앱 "설정" 탭에서 입력한 API 키를 Supabase api_config 테이블에서 읽고 씁니다.
// (기존 Gemini API 키 저장 방식과 동일한 패턴)

export async function getConfig(key: string): Promise<string | null> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("api_config")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    console.error(`api_config 조회 실패 (${key}):`, error.message);
    return null;
  }
  return data?.value ?? null;
}

export async function setConfig(key: string, value: string): Promise<void> {
  const supabase = getSupabaseServer();
  const { error } = await supabase
    .from("api_config")
    .upsert({ key, value, updated_at: new Date().toISOString() });

  if (error) throw new Error(error.message);
}

export interface ConfigStatus {
  isSet: boolean;
  updatedAt: string | null;
}

// 설정 탭에 "저장됨/미설정" 상태만 보여주기 위한 조회 (값 자체는 반환하지 않음)
export async function getConfigStatuses(
  keys: string[]
): Promise<Record<string, ConfigStatus>> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("api_config")
    .select("key, updated_at")
    .in("key", keys);

  if (error) throw new Error(error.message);

  const result: Record<string, ConfigStatus> = {};
  for (const k of keys) result[k] = { isSet: false, updatedAt: null };
  for (const row of data ?? []) {
    result[row.key] = { isSet: true, updatedAt: row.updated_at };
  }
  return result;
}

// DB에 저장된 값을 우선 사용하고, 없으면 Vercel 환경변수로 폴백
// (기존에 env로 설정해두신 경우를 위한 하위 호환)
export async function requireConfig(key: string, envFallbackName?: string): Promise<string> {
  const dbValue = await getConfig(key);
  if (dbValue) return dbValue;

  const envValue = envFallbackName ? process.env[envFallbackName] : undefined;
  if (envValue) return envValue;

  throw new Error(`${key}가 설정되지 않았습니다. 설정 탭에서 API 키를 입력해주세요.`);
}
