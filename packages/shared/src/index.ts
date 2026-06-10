// @jhtechsaas/shared — 웹(apps/web)과 워커(apps/worker)가 공유하는 코드.
// 도메인 타입 · capability 권한 registry · Supabase 클라이언트 팩토리.

export const SHARED_PACKAGE = "@jhtechsaas/shared";

export * from "./permissions";
export * from "./specs";
export * from "./supabase";
export * from "./seed";
export * from "./types";
export * from "./biz-no";
export * from "./phone";
export * from "./quote-calc";
export * from "./korean-amount";
