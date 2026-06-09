// 연락처·사업자번호 표시 포맷 — 자리수에 맞춰 하이픈 자동 삽입.
// 표시 전용(저장값은 그대로). 자리수가 규칙에 안 맞으면 원본을 그대로 돌려준다(임의 가공 금지).

/** 사업자등록번호 10자리 → `XXX-XX-XXXXX`. 10자리가 아니면 원본 유지. */
export function formatBizNo(raw: string | null | undefined): string {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (d.length !== 10) return raw;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

/**
 * 전화/휴대폰 → 한국 표준 하이픈.
 * - 대표번호(15xx·16xx·18xx, 8자리): `1577-1234`
 * - 서울(02): `02-123-4567`(9자리) / `02-1234-5678`(10자리)
 * - 휴대폰·지역번호: `010-1234-5678`(11자리) / `031-123-4567`(10자리)
 * 규칙에 안 맞으면 원본 유지.
 */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");

  // 대표번호 15xx/16xx/18xx (8자리)
  if (d.length === 8 && /^1[5678]/.test(d)) return `${d.slice(0, 4)}-${d.slice(4)}`;

  // 서울 02
  if (d.startsWith("02")) {
    if (d.length === 9) return `02-${d.slice(2, 5)}-${d.slice(5)}`;
    if (d.length === 10) return `02-${d.slice(2, 6)}-${d.slice(6)}`;
    return raw;
  }

  // 휴대폰·지역번호(3자리 국번)
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;

  return raw;
}
