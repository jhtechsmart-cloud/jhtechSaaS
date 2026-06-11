import { formatPhone } from "@jhtechsaas/shared";

// 입력 중 자동 하이픈 마스킹 — 폼에서 onChange마다 호출(숫자만 다시 계산해 붙여넣기·수정에 안전).

/** 사업자번호 진행형 마스킹(3-2-5). 10자리 초과는 잘라냄. */
export function maskBizNoTyping(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

/** 전화번호 마스킹 — 완성 길이(9~11자리)면 표준 포맷(formatPhone), 미완성은 숫자 그대로. */
export function maskPhoneTyping(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length >= 9 && d.length <= 11) {
    const formatted = formatPhone(d);
    if (formatted !== d) return formatted;
  }
  return d;
}
