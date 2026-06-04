import type { ReactNode } from "react";
import Link from "next/link";
import { can, type PermissionKey } from "@jhtechsaas/shared";
import { requireAnyConsoleCapability } from "@/lib/auth/guard";
import { countUnreadServiceRequests } from "@/lib/service-requests/queries";
import { countUnreadSupplyRequests } from "@/lib/supply-requests/queries";
import { countNewApplications } from "@/lib/applications/admin-queries";
import { signOut } from "@/app/login/actions";

// 콘솔 셸 — 사이드바196 + 상단바. requireAnyConsoleCapability가 미인증을 /login으로 보내고,
// 콘솔 권한 없는/비활성 로그인 사용자는 403 패널을 렌더(#29 — 영업담당도 셸 진입).
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const access = await requireAnyConsoleCapability();

  if (access.status === "forbidden") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">
          콘솔 접근 권한이 없거나 비활성 계정입니다. 관리자에게 문의하세요.
        </p>
        <form action={signOut}>
          <button className="text-small text-accent underline">로그아웃</button>
        </form>
      </main>
    );
  }

  // 미열람 카운트는 병렬(요청유형 늘수록 직렬 await가 콘솔 전체를 느리게 함).
  const [unread, supplyUnread, newApps] = await Promise.all([
    countUnreadServiceRequests(),
    countUnreadSupplyRequests(),
    countNewApplications(),
  ]);

  const perms = access.permissions;
  const anyOf = (keys: PermissionKey[]) => keys.some((k) => can(perms, k));
  // nav 데이터화 — 권한별 조건 노출. 신청 도메인은 view_all/status/claim 등 콘솔 키 중 하나.
  const items: { href: string; label: string; show: boolean; badge?: number }[] = [
    { href: "/admin/dashboard", label: "대시보드", show: true },
    {
      href: "/admin/applications",
      label: "견적",
      show: anyOf(["applications.view_all", "applications.assign", "applications.status", "applications.claim"]),
      badge: newApps,
    },
    { href: "/admin/customers", label: "고객", show: anyOf(["customers.edit", "customers.view_all"]) },
    {
      href: "/admin/service-requests",
      label: "A/S",
      show: anyOf(["service_requests.view_all", "service_requests.status", "service_requests.claim"]),
      badge: unread,
    },
    {
      href: "/admin/supply-requests",
      label: "소모품신청",
      show: anyOf(["supply_requests.view_all", "supply_requests.status", "supply_requests.claim"]),
      badge: supplyUnread,
    },
    { href: "/admin/equipment", label: "장비", show: can(perms, "equipment.manage") },
    { href: "/admin/consumables", label: "소모품", show: can(perms, "consumables.manage") },
    { href: "/admin/categories", label: "분류", show: can(perms, "equipment.manage") },
    { href: "/admin/users", label: "사용자", show: can(perms, "users.manage") },
  ];

  return (
    <div className="flex min-h-dvh">
      <aside className="w-[196px] shrink-0 border-r border-border bg-surface p-4">
        <p className="mb-4 text-small font-semibold text-muted">재현테크</p>
        <nav className="flex flex-col gap-1">
          {items
            .filter((it) => it.show)
            .map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="flex items-center justify-between rounded-md px-3 py-2 text-body font-medium text-text hover:bg-surface-2"
              >
                <span>{it.label}</span>
                {it.badge != null && it.badge > 0 && (
                  <span
                    className="rounded-full bg-accent px-2 py-0.5 text-micro font-medium text-white"
                    aria-label={`${it.badge}건`}
                  >
                    {it.badge}
                  </span>
                )}
              </Link>
            ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-6 py-3">
          <span className="text-small text-muted">재현테크 콘솔</span>
          <form action={signOut}>
            <button className="text-small text-muted hover:text-text">로그아웃</button>
          </form>
        </header>
        <main className="mx-auto w-full max-w-[1140px] flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
