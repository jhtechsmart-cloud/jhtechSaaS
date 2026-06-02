// A/S status 상수/타입 — 서버·클라 공유(server-only 아님).
// queries.ts(server-only)와 분리해 클라이언트 컴포넌트가 import할 수 있게 한다.
export const SERVICE_REQUEST_STATUSES = ["received", "in_progress", "on_hold", "done", "canceled"] as const;
export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number];
