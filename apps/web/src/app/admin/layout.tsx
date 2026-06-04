import type { ReactNode } from "react";
import Link from "next/link";
import { can } from "@jhtechsaas/shared";
import { requireEquipmentManage } from "@/lib/auth/guard";
import { countUnreadServiceRequests } from "@/lib/service-requests/queries";
import { countUnreadSupplyRequests } from "@/lib/supply-requests/queries";
import { countNewApplications } from "@/lib/applications/admin-queries";
import { signOut } from "@/app/login/actions";

// 콘솔 셸 — 사이드바196 + 상단바. requireEquipmentManage가 미인증을 /login으로 보내고,
// 권한 없는 로그인 사용자는 403 패널을 렌더(AC2).
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const access = await requireEquipmentManage();
  // 미열람 카운트는 병렬(요청유형 늘수록 직렬 await가 콘솔 전체를 느리게 함).
  const [unread, supplyUnread, newApps] =
    access.status === "ok"
      ? await Promise.all([
          countUnreadServiceRequests(),
          countUnreadSupplyRequests(),
          countNewApplications(),
        ])
      : [0, 0, 0];
  // 사용자 관리 메뉴는 users.manage 보유 시만 노출(전체 nav 데이터화는 step5).
  const canManageUsers = access.status === "ok" && can(access.permissions, "users.manage");

  if (access.status === "forbidden") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">
          장비 관리 권한(equipment.manage)이 필요합니다. 관리자에게 문의하세요.
        </p>
        <form action={signOut}>
          <button className="text-small text-accent underline">로그아웃</button>
        </form>
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh">
      <aside className="w-[196px] shrink-0 border-r border-border bg-surface p-4">
        <p className="mb-4 text-small font-semibold text-muted">재현테크</p>
        <nav className="flex flex-col gap-1">
          <Link
            href="/admin/equipment"
            className="rounded-md px-3 py-2 text-body font-medium text-text hover:bg-surface-2"
          >
            장비
          </Link>
          <Link
            href="/admin/customers"
            className="rounded-md px-3 py-2 text-body font-medium text-text hover:bg-surface-2"
          >
            고객
          </Link>
          <Link
            href="/admin/applications"
            className="flex items-center justify-between rounded-md px-3 py-2 text-body font-medium text-text hover:bg-surface-2"
          >
            <span>견적</span>
            {newApps > 0 && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-micro font-medium text-white" aria-label={`미처리 ${newApps}건`}>{newApps}</span>
            )}
          </Link>
          <Link
            href="/admin/consumables"
            className="rounded-md px-3 py-2 text-body font-medium text-text hover:bg-surface-2"
          >
            소모품
          </Link>
          <Link
            href="/admin/categories"
            className="rounded-md px-3 py-2 text-body font-medium text-text hover:bg-surface-2"
          >
            분류
          </Link>
          <Link
            href="/admin/service-requests"
            className="flex items-center justify-between rounded-md px-3 py-2 text-body font-medium text-text hover:bg-surface-2"
          >
            <span>A/S</span>
            {unread > 0 && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-micro font-medium text-white">{unread}</span>
            )}
          </Link>
          <Link
            href="/admin/supply-requests"
            className="flex items-center justify-between rounded-md px-3 py-2 text-body font-medium text-text hover:bg-surface-2"
          >
            <span>소모품신청</span>
            {supplyUnread > 0 && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-micro font-medium text-white">{supplyUnread}</span>
            )}
          </Link>
          {canManageUsers && (
            <Link
              href="/admin/users"
              className="rounded-md px-3 py-2 text-body font-medium text-text hover:bg-surface-2"
            >
              사용자
            </Link>
          )}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-6 py-3">
          <span className="text-small text-muted">장비 관리</span>
          <form action={signOut}>
            <button className="text-small text-muted hover:text-text">로그아웃</button>
          </form>
        </header>
        <main className="mx-auto w-full max-w-[1140px] flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
