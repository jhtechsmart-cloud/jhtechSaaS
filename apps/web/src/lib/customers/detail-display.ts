// 고객 상세 표시 순수 로직 — 컴포넌트와 테스트가 공유(서버 의존 없음).

/** 미입력 판정 — null/빈문자열/공백/"-"는 null(FieldRow가 "미입력"으로 흐리게 렌더). */
export function displayValue(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "" || s === "-") return null;
  return s;
}

/** 주 연락처 — 전화1 → 휴대폰 → 전화2 폴백. 모두 없으면 phone null(빈 상태). */
export function pickPrimaryContact(c: {
  phone1?: string | null;
  mobile?: string | null;
  phone2?: string | null;
  email?: string | null;
}): { phone: string | null; email: string | null } {
  const phone =
    displayValue(c.phone1) ?? displayValue(c.mobile) ?? displayValue(c.phone2);
  return { phone, email: displayValue(c.email ?? null) };
}

/** 업태 등 다중값 — 쉼표·공백 혼용 분리 + 중복 제거(배지 칩 렌더용). */
export function splitChips(v: string | null | undefined): string[] {
  const s = displayValue(v ?? null);
  if (!s) return [];
  return Array.from(new Set(s.split(/[,\s]+/).filter(Boolean)));
}

// 법인 접두 — 이니셜 추출 시 제거.
const CORP_PREFIXES = ["(주)", "(유)", "(합)", "주식회사", "유한회사"];

/** 업체명 이니셜(아바타용) — 법인 접두 제거 후 첫 글자. */
export function initialOf(name: string): string {
  let s = name.trim();
  for (const p of CORP_PREFIXES) {
    if (s.startsWith(p)) {
      s = s.slice(p.length).trim();
      break;
    }
  }
  return s.charAt(0).toUpperCase() || "?";
}

/** 거래상태(파생) — companies에 상태 컬럼이 없어 이력 존재 여부로 표시(표시전용). */
export function tradeStatusOf(counts: {
  quotes: number;
  equipment: number;
  as: number;
  supply: number;
}): "거래중" | "신규" {
  return counts.quotes + counts.equipment + counts.as + counts.supply > 0 ? "거래중" : "신규";
}
