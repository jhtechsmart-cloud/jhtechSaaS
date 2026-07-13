import { z } from "zod";

// 연락처 최소 1개 — 휴대폰·전화1·대표연락처 중 하나라도 값(공백 제외)이 있으면 true.
export function hasAnyContact(v: { mobile?: string; phone1?: string; phone?: string }): boolean {
  return [v.mobile, v.phone1, v.phone].some((s) => (s ?? "").trim() !== "");
}

// 회사명 정규화(중복 비교용) — 공백 제거 + 소문자. SQL check_company_duplicate와 규칙 일치.
export function normalizeCompanyName(name: string): string {
  return name.replace(/\s/g, "").toLowerCase();
}

// 선택 이메일 — 빈 값 허용, 값이 있으면 형식 검증.
const emailSchema = z.string().email();
export function isOptionalEmailValid(email: string): boolean {
  const t = email.trim();
  return t === "" || emailSchema.safeParse(t).success;
}
