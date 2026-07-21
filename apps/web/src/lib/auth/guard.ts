import "server-only";
import { redirect } from "next/navigation";
import { can, type PermissionKey } from "@jhtechsaas/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveAccess } from "@/lib/auth/access";
import { hasAnyConsoleCapability, landingPathFor } from "@/lib/auth/console";

export type GuardResult =
  | { status: "ok"; userId: string; permissions: string[]; mustChangePassword?: boolean }
  | { status: "forbidden" };

// 세션 + profile(permissions·is_active) 적재. 미인증이면 /login으로 리다이렉트(throw).
// profile 없음·조회 실패는 null(fail-closed) — 호출부가 forbidden 처리.
async function loadAccessContext(): Promise<
  { userId: string; permissions: string[]; isActive: boolean; mustChangePassword: boolean } | null
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login"); // never 반환
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("permissions,is_active,must_change_password")
    .eq("id", user.id)
    .single();

  if (error) {
    // 행 없음(PGRST116)은 조용히. 그 외(DB·RLS·네트워크)는 로그 후 fail-closed.
    if (error.code !== "PGRST116") {
      console.error("[loadAccessContext] profile 조회 실패", error);
    }
    return null;
  }
  return {
    userId: user.id,
    permissions: profile.permissions ?? [],
    isActive: profile.is_active ?? false,
    mustChangePassword: profile.must_change_password ?? false,
  };
}

// 세션+권한 서버 검증. 미인증이면 /login 리다이렉트(throw).
// 권한 없음·비활성 계정은 { status: "forbidden" } 반환 → layout/page가 403 렌더.
// ⚠️ Server Action은 직접 POST로도 도달 가능 → action에서도 이 가드를 재호출할 것.
export async function requirePermission(required: PermissionKey): Promise<GuardResult> {
  const ctx = await loadAccessContext();
  if (!ctx) return { status: "forbidden" };
  const access = resolveAccess(ctx.userId, ctx.permissions, required, ctx.isActive);
  if (access.status === "ok") {
    return { status: "ok", userId: ctx.userId, permissions: ctx.permissions };
  }
  return { status: "forbidden" };
}

// 여러 키 중 하나라도 보유하면 ok. (예: 신청 도메인 콘솔 = view_all OR status OR claim …)
export async function requireAnyPermission(required: PermissionKey[]): Promise<GuardResult> {
  const ctx = await loadAccessContext();
  if (!ctx) return { status: "forbidden" };
  if (!ctx.isActive) return { status: "forbidden" };
  if (required.some((k) => can(ctx.permissions, k))) {
    return { status: "ok", userId: ctx.userId, permissions: ctx.permissions };
  }
  return { status: "forbidden" };
}

// 콘솔 셸 진입 가드 — 콘솔 키 중 하나라도 보유(+활성)하면 ok. (#29 해소)
export async function requireAnyConsoleCapability(): Promise<GuardResult> {
  const ctx = await loadAccessContext();
  if (!ctx) return { status: "forbidden" };
  if (!ctx.isActive || !hasAnyConsoleCapability(ctx.permissions)) {
    return { status: "forbidden" };
  }
  return {
    status: "ok",
    userId: ctx.userId,
    permissions: ctx.permissions,
    mustChangePassword: ctx.mustChangePassword,
  };
}

// 로그인 후 첫 화면 경로 — 권한 기반. 미인증이면 loadAccessContext가 /login으로 보냄.
// profile 없음(비정상)은 /login. is_active 차단은 도착 페이지의 콘솔 가드가 forbidden 렌더.
export async function resolveLandingPath(): Promise<string> {
  const ctx = await loadAccessContext();
  if (!ctx) return "/login";
  return landingPathFor(ctx.permissions);
}

export const requireEquipmentManage = () => requirePermission("equipment.manage");
// E5a: customers.manage(통합) → 액션별 분해. 등록·수정=edit, 삭제=delete, 전체조회=view_all.
export const requireCustomersEdit = () => requirePermission("customers.edit");
export const requireCustomersDelete = () => requirePermission("customers.delete");
export const requireCustomersViewAll = () => requirePermission("customers.view_all");
export const requireConsumablesManage = () => requirePermission("consumables.manage");
export const requireUsersManage = () => requirePermission("users.manage");
export const requireQuotesWrite = () => requirePermission("quotes.write");
export const requireReleaseOrdersWrite = () => requirePermission("release_orders.write");
export const requireDemoReservationsWrite = () =>
  requirePermission("demo_reservations.write");

// 신청 3종 콘솔 가드 — 도메인 키 중 하나라도(view_all/assign/status/claim). RLS가 행 스코프 강제.
export const requireApplicationsConsole = () =>
  requireAnyPermission([
    "applications.view_all",
    "applications.assign",
    "applications.status",
    "applications.claim",
  ]);
export const requireServiceConsole = () =>
  requireAnyPermission([
    "service_requests.view_all",
    "service_requests.status",
    "service_requests.claim",
  ]);
export const requireSupplyConsole = () =>
  requireAnyPermission([
    "supply_requests.view_all",
    "supply_requests.status",
    "supply_requests.claim",
  ]);
export const requireServiceReportsWrite = () => requirePermission("service_reports.write");
// 장비 상세(#243) — 리포트 조회 3키(영업=view) 또는 카탈로그 관리자. ⚠️ view_all 단독 요구 금지(영업 403).
export const requireEquipmentDetailRead = () =>
  requireAnyPermission([
    "service_reports.write",
    "service_reports.view",
    "service_reports.view_all",
    "equipment.manage",
  ]);
// 서비스 리포트 조회 — admin 조회 화면용. view는 발행·무효본만 보는 읽기전용 키(영업 기본).
export const requireServiceReportsRead = () =>
  requireAnyPermission(["service_reports.write", "service_reports.view", "service_reports.view_all"]);
