import "server-only";
// 홈페이지(워드프레스) 공개 정보(#253) — 글 링크 조립·카테고리 목록 fetch.
// 단일테넌트 고정 도메인. SSL 적용 완료(2026-08-05 Sectigo DV)로 https 전환.
export const WP_PUBLIC_SITE = "https://jhtech.co.kr";

export interface WpCategory {
  id: number;
  name: string;
}

// WP 카테고리 목록(공개 API, 인증 불필요) — 분류 관리 드롭다운용.
// 실패 시 null(드롭다운 대신 재시도 안내 — 숫자 입력 폴백 없음, autoplan 결정 17).
export async function fetchWpCategories(): Promise<WpCategory[] | null> {
  try {
    const res = await fetch(
      `${WP_PUBLIC_SITE}/wp-json/wp/v2/categories?per_page=100&_fields=id,name`,
      { next: { revalidate: 3600 }, signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (!Array.isArray(json)) return null;
    return json
      .filter(
        (c): c is { id: number; name: string } =>
          typeof c === "object" && c !== null && typeof (c as { id?: unknown }).id === "number",
      )
      .map((c) => ({ id: c.id, name: String(c.name) }));
  } catch {
    return null;
  }
}
