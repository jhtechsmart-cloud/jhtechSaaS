import { formatKstDateTime } from "@jhtechsaas/shared";

// 처리바 버전 칩 — 최신/선택 버전 요약(버전·견적번호·발급일시·합계·상태). 순수 로직.
export type VersionChip = {
  versionLabel: string; // "v3"
  quoteNo: string; // "JHQ-…-V3"
  dateLabel: string; // "2026.06.16 · 14:20" (KST). 잘못된 입력이면 빈 문자열.
  totalLabel: string; // "₩30,000,000" (공급가, VAT 별도)
  statusLabel: string; // "발행" | "임시"
  issued: boolean;
};

export function buildVersionChip(q: {
  quote_no: string;
  version: number;
  status: string;
  supply_price: string;
  issued_at: string | null;
  created_at: string;
}): VersionChip {
  const issued = q.status === "issued";
  // 발급일시는 발행본 issued_at 우선, 없으면 created_at. 잘못된 입력은 빈 문자열로 가드.
  const dateLabel = formatKstDateTime(q.issued_at ?? q.created_at) ?? "";
  return {
    versionLabel: `v${q.version}`,
    quoteNo: q.quote_no,
    dateLabel,
    totalLabel: `₩${Number(q.supply_price).toLocaleString("ko-KR")}`,
    statusLabel: issued ? "발행" : "임시",
    issued,
  };
}
