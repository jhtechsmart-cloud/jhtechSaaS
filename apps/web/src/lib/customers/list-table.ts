import { z } from "zod";

// 고객 목록 테이블 순수 로직 — 상대시간·페이지 윈도·검색어 하이라이트·URL 파라미터 스키마.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const kstDayIndex = (ms: number): number => Math.floor((ms + KST_OFFSET_MS) / DAY_MS);

/** 최근 활동 상대시간 — 오늘/어제/N일 전/N개월 전. null=활동 없음(표시는 UI 몫). */
export function relativeTime(iso: string | null, now: Date): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  const days = kstDayIndex(now.getTime()) - kstDayIndex(ms);
  if (days <= 0) return "오늘";
  if (days === 1) return "어제";
  if (days < 31) return `${days}일 전`;
  return `${Math.max(1, Math.round(days / 30.44))}개월 전`;
}

/** 페이지네이션 윈도 — 처음 2·끝 2·현재±1, 사이는 "…". 연속이면 생략 없이 이어붙임. */
export function pageWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const keep = new Set<number>([1, 2, total - 1, total, current - 1, current, current + 1]);
  const pages = Array.from(keep).filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of pages) {
    if (p - prev === 2) out.push(prev + 1); // 한 칸 틈은 "…" 대신 실제 번호
    else if (p - prev > 2) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

/** 검색어 일치 구간 분해 — <mark> 렌더용(대소문자 무시, 정규식 메타 안전). */
export function highlightParts(text: string, q: string): { text: string; match: boolean }[] {
  const needle = q.trim();
  if (!needle) return [{ text, match: false }];
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${escaped})`, "ig");
  return text
    .split(re)
    .filter((s) => s !== "")
    .map((s) => ({ text: s, match: s.toLowerCase() === needle.toLowerCase() }));
}

/** URL searchParams 스키마 — 서버 액션 직접 POST 방어 겸 기본값 단일화. */
export const customerListParamsSchema = z.object({
  q: z.string().trim().max(200).optional(),
  region: z.string().trim().max(10).optional(),
  sales: z.string().trim().max(64).optional(), // profile id 또는 "none"(미배정)
  quick: z.enum(["all", "trading", "unassigned", "recent"]).default("all"),
  sort: z.enum(["name", "region", "last"]).default("last"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pp: z.coerce.number().pipe(z.union([z.literal(25), z.literal(50), z.literal(100)])).default(50),
});

export type CustomerListParams = z.infer<typeof customerListParamsSchema>;
