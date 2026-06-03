// 소모품신청 status 상수/타입 — 서버·클라 공유(server-only 아님). 공통 스파인(P-D와 동일 5단계) 재사용.
import { REQUEST_STATUSES, type RequestStatus } from "@/lib/request-status";

export const SUPPLY_REQUEST_STATUSES = REQUEST_STATUSES;
export type SupplyRequestStatus = RequestStatus;
