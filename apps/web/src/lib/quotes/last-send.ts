import { formatKstDateTime } from "@jhtechsaas/shared";

// 모달의 "직전 발송" 한 줄 — 마지막 발송 행(수신자·상태·시각)을 사람이 읽기 좋게.
export type LastSend = { to: string; status: string; at: string };

export function formatLastSendLine(lastSend: LastSend | null): string | null {
  if (!lastSend) return null;
  const when = formatKstDateTime(lastSend.at);
  const statusLabel =
    lastSend.status === "sent" ? "성공" : lastSend.status === "failed" ? "실패" : lastSend.status;
  return `직전 발송: ${lastSend.to} (${statusLabel}${when ? `, ${when}` : ""})`;
}
