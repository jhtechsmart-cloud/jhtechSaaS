// A/S status 배지 — 공통 색 스파인(@/lib/request-status) 단일 출처 재export.
// (P-E 소모품신청도 같은 모듈 사용 → 색·라벨 중복 정의 제거. ServiceRequestStatus ⊆ RequestStatus.)
export { STATUS_META, StatusBadge } from "@/lib/request-status";
