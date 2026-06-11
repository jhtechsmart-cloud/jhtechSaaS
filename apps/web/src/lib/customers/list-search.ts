// 고객 목록 서버검색 순수 헬퍼 — Supabase 의존 없이 단위테스트 가능(admin-search.ts 패턴).

// PostgREST .or()·ilike 메타문자를 제거해 필터/와일드카드 주입을 막는다.
// 업체명·장부명=입력 그대로, 사업자번호=숫자 정규화(DB 저장 형식), 전화=하이픈 포함(저장 형식).
export function buildCompanySearchOr(q: string): string | null {
  const cleaned = q.replace(/[,()%_*\\]/g, "").trim();
  if (cleaned === "") return null;
  const parts = [`name.ilike.%${cleaned}%`, `ledger_name.ilike.%${cleaned}%`];
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length >= 3) {
    parts.push(`biz_no.ilike.%${digits}%`);
    parts.push(`phone1.ilike.%${cleaned}%`);
    parts.push(`mobile.ilike.%${cleaned}%`);
  }
  return parts.join(",");
}

// 주소 앞부분 → 시·도 배지(탐색 보조, 표시전용). 인식 불가는 null.
const REGION_PREFIXES: [string, string][] = [
  ["서울", "서울"], ["부산", "부산"], ["대구", "대구"], ["인천", "인천"],
  ["광주", "광주"], ["대전", "대전"], ["울산", "울산"], ["세종", "세종"],
  ["경기", "경기"], ["강원", "강원"],
  ["충청북도", "충북"], ["충북", "충북"], ["충청남도", "충남"], ["충남", "충남"],
  ["전라북도", "전북"], ["전북", "전북"], ["전라남도", "전남"], ["전남", "전남"],
  ["경상북도", "경북"], ["경북", "경북"], ["경상남도", "경남"], ["경남", "경남"],
  ["제주", "제주"],
];

export function regionOf(address: string | null | undefined): string | null {
  const a = (address ?? "").trim();
  if (!a) return null;
  for (const [prefix, label] of REGION_PREFIXES) {
    if (a.startsWith(prefix)) return label;
  }
  return null;
}
