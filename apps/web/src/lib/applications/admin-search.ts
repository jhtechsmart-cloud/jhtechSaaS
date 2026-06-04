// 목록 서버검색 순수 헬퍼 — Supabase 의존 없이 단위테스트 가능.

// PostgREST .or()·ilike 메타문자를 제거해 필터/와일드카드 주입을 막는다.
// 하이픈(REQ-)·한글·영숫자·공백은 보존.
export function buildSearchOr(q: string): string | null {
  const cleaned = q.replace(/[,()%_*\\]/g, "").trim();
  if (cleaned === "") return null;
  return `company.ilike.%${cleaned}%,seq_no.ilike.%${cleaned}%`;
}

// limit+1로 가져온 행에서 초과 여부를 감지하고 limit개로 자른다.
export function splitOverflow<T>(rows: T[], limit: number): { rows: T[]; overflow: boolean } {
  if (rows.length > limit) return { rows: rows.slice(0, limit), overflow: true };
  return { rows, overflow: false };
}

// 사업자번호 정규화 — 숫자만 남긴다. companies.biz_no는 upsert RPC가 숫자정규화 저장하므로
// application쪽(하이픈 잔류 가능)만 정규화해 .eq로 단순 매칭(P-F 역링크 판정).
export function normalizeBizNo(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}
