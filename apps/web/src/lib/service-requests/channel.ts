// A/S 접수 경로(channel) — DB CHECK(web/phone/visit/other)와 1:1. 라벨·배지 톤 단일 출처.
// 직원 대행 접수는 phone/visit/other만 선택 가능(web은 공개 폼 전용).
export const SERVICE_REQUEST_CHANNELS = ["web", "phone", "visit", "other"] as const;
export type ServiceRequestChannel = (typeof SERVICE_REQUEST_CHANNELS)[number];

export const STAFF_CHANNELS = ["phone", "visit", "other"] as const;
export type StaffChannel = (typeof STAFF_CHANNELS)[number];

export const CHANNEL_META: Record<ServiceRequestChannel, { label: string; badgeClass: string }> = {
  // DESIGN 3톤 규칙: 웹=중립, 전화=파인(주 액센트), 방문=파랑(info, 일정·방문 계열), 기타=muted.
  web: { label: "웹", badgeClass: "bg-surface-2 text-muted" },
  phone: { label: "전화", badgeClass: "bg-accent-soft text-accent" },
  visit: { label: "방문", badgeClass: "bg-info-soft text-info" },
  other: { label: "기타", badgeClass: "bg-surface-2 text-muted" },
};

export function channelLabel(ch: string | null | undefined): string {
  return CHANNEL_META[(ch ?? "web") as ServiceRequestChannel]?.label ?? "웹";
}

export function isStaffChannel(v: string): v is StaffChannel {
  return (STAFF_CHANNELS as readonly string[]).includes(v);
}
