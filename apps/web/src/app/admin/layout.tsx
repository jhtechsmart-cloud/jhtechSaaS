import type { ReactNode } from "react";
import Link from "next/link";
import { can, type PermissionKey } from "@jhtechsaas/shared";
import { requireAnyConsoleCapability } from "@/lib/auth/guard";
import { countUnreadServiceRequests } from "@/lib/service-requests/queries";
import { countUnreadSupplyRequests } from "@/lib/supply-requests/queries";
import { countNewApplications } from "@/lib/applications/admin-queries";
import { signOut } from "@/app/login/actions";
import { Icon } from "./_components/Icon";

// 콘솔 셸 — 네이비 사이드바(아이콘) + 상단바. requireAnyConsoleCapability가 미인증을 /login으로,
// 콘솔 권한 없는/비활성 사용자는 403 패널(#29 — 영업담당도 셸 진입).
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const access = await requireAnyConsoleCapability();

  if (access.status === "forbidden") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg p-6">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">콘솔 접근 권한이 없거나 비활성 계정입니다. 관리자에게 문의하세요.</p>
        <form action={signOut}>
          <button className="text-small text-accent underline">로그아웃</button>
        </form>
      </main>
    );
  }

  const [unread, supplyUnread, newApps] = await Promise.all([
    countUnreadServiceRequests(),
    countUnreadSupplyRequests(),
    countNewApplications(),
  ]);
  const totalAlerts = unread + supplyUnread + newApps;

  const perms = access.permissions;
  const anyOf = (keys: PermissionKey[]) => keys.some((k) => can(perms, k));
  const isAdmin = can(perms, "users.manage");

  // nav 데이터화 — 권한별 조건 노출 + 아이콘.
  const items: { href: string; label: string; icon: string; show: boolean; badge?: number }[] = [
    { href: "/admin/dashboard", label: "대시보드", icon: "dashboard", show: true },
    {
      href: "/admin/applications", label: "견적", icon: "applications",
      show: anyOf(["applications.view_all", "applications.assign", "applications.status", "applications.claim"]),
      badge: newApps,
    },
    { href: "/admin/customers", label: "고객", icon: "customers", show: anyOf(["customers.edit", "customers.view_all"]) },
    {
      href: "/admin/service-requests", label: "A/S", icon: "service",
      show: anyOf(["service_requests.view_all", "service_requests.status", "service_requests.claim"]),
      badge: unread,
    },
    {
      href: "/admin/supply-requests", label: "소모품신청", icon: "supply",
      show: anyOf(["supply_requests.view_all", "supply_requests.status", "supply_requests.claim"]),
      badge: supplyUnread,
    },
    { href: "/admin/equipment", label: "장비", icon: "equipment", show: can(perms, "equipment.manage") },
    { href: "/admin/consumables", label: "소모품", icon: "consumables", show: can(perms, "consumables.manage") },
    { href: "/admin/categories", label: "분류", icon: "categories", show: can(perms, "equipment.manage") },
    { href: "/admin/users", label: "사용자", icon: "users", show: can(perms, "users.manage") },
  ];

  return (
    <div className="flex min-h-dvh bg-bg">
      {/* 사이드바 — 라이트(본문 배경보다 살짝 진한 sidebar 톤) */}
      <aside className="flex w-[224px] shrink-0 flex-col border-r border-border bg-sidebar text-text">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white shadow-sm">
            <Icon name="dashboard" size={18} />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-body font-semibold text-text">재현테크</span>
            <span className="text-micro text-muted">견적관리 콘솔</span>
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2">
          {items.filter((it) => it.show).map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-body font-medium text-sidebar-text transition-colors hover:bg-accent-soft hover:text-accent"
            >
              <Icon name={it.icon} size={18} className="shrink-0 text-muted transition-colors group-hover:text-accent" />
              <span className="flex-1">{it.label}</span>
              {it.badge != null && it.badge > 0 && (
                <span className="rounded-full bg-accent px-2 py-0.5 text-micro font-semibold text-white">
                  {it.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>

        {/* 프로필 */}
        <div className="mx-3 mb-4 mt-2 flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-small font-semibold text-white">
            {isAdmin ? "관" : "영"}
          </span>
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-small font-medium text-text">{isAdmin ? "관리자" : "영업담당"}</span>
            <span className="truncate text-micro text-muted">재현테크</span>
          </span>
          <form action={signOut}>
            <button className="text-muted transition-colors hover:text-accent" aria-label="로그아웃" title="로그아웃">
              <Icon name="logout" size={18} />
            </button>
          </form>
        </div>
      </aside>

      {/* 본문 영역 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 상단바 */}
        <header className="flex items-center gap-4 border-b border-border bg-surface px-6 py-3">
          <div className="flex max-w-md flex-1 items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-muted">
            <Icon name="search" size={16} />
            <span className="text-small">검색 (준비중)</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-bg text-muted">
              <Icon name="bell" size={18} />
              {totalAlerts > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
                  {totalAlerts}
                </span>
              )}
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-small font-semibold text-white">
              {isAdmin ? "관" : "영"}
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1320px] flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
