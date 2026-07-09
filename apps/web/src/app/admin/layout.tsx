import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { can, type PermissionKey } from "@jhtechsaas/shared";
import { requireAnyConsoleCapability } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { avatarPublicUrl } from "@/lib/avatar/avatar";
import { countUnreadServiceRequests } from "@/lib/service-requests/queries";
import { countUnreadSupplyRequests } from "@/lib/supply-requests/queries";
import { countNewApplications } from "@/lib/applications/admin-queries";
import { signOut } from "@/app/login/actions";
import { Icon } from "./_components/Icon";
import { AdminSidebar } from "./_components/AdminSidebar";
import { AccountMenu } from "./_components/AccountMenu";
import { MobileNav } from "./_components/MobileNav";
import { ForcedPasswordChange } from "./_components/ForcedPasswordChange";
import { BadgePoller } from "./_components/BadgePoller";
import { ConsoleMain } from "./_components/ConsoleMain";

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

  // 임시 비밀번호 상태 → 변경 전엔 콘솔 차단(사이드바·본문 대신 전체화면 변경 패널).
  if (access.mustChangePassword) {
    return <ForcedPasswordChange />;
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

  // 현재 사용자 표시 정보(이름·사진·이메일) — 우상단 계정 메뉴·사이드바 하단 공용.
  const supabase = await createSupabaseServerClient();
  const [{ data: authUser }, { data: meProfile }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("profiles").select("name, avatar_url, position").eq("id", access.userId).single(),
  ]);
  const userName = (meProfile as { name?: string | null } | null)?.name ?? null;
  const userPosition = (meProfile as { position?: string | null } | null)?.position ?? null;
  const userEmail = authUser?.user?.email ?? null;
  const avatarUrl = avatarPublicUrl((meProfile as { avatar_url?: string | null } | null)?.avatar_url);

  // 사이드바 접기 선택을 쿠키로 읽어 초기값 전달(서버·클라 일치 → hydration mismatch 방지).
  const sc = (await cookies()).get("jh.sidebarCollapsed")?.value;
  const initialOverride = sc === "1" ? true : sc === "0" ? false : null;

  // nav 데이터화 — 권한별 조건 노출 + 아이콘.
  const items: { href: string; label: string; icon: string; show: boolean; badge?: number; section: string }[] = [
    { href: "/admin/dashboard", label: "대시보드", icon: "dashboard", show: true, section: "업무" },
    {
      href: "/admin/applications", label: "견적", icon: "applications", section: "업무",
      show: anyOf(["applications.view_all", "applications.assign", "applications.status", "applications.claim"]),
      badge: newApps,
    },
    // TODO(테마 스펙): 고객 메뉴 건수 칩 — 전체 고객 카운트 쿼리 연결 시 badge 추가
    { href: "/admin/customers", label: "고객", icon: "customers", show: anyOf(["customers.edit", "customers.view_all"]), section: "업무" },
    { href: "/admin/sales-logs", label: "영업일지", icon: "book", show: anyOf(["quotes.write", "customers.edit", "customers.view_all"]), section: "업무" },
    {
      href: "/admin/service-requests", label: "A/S", icon: "service", section: "업무",
      show: anyOf(["service_requests.view_all", "service_requests.status", "service_requests.claim"]),
      badge: unread,
    },
    {
      href: "/admin/supply-requests", label: "소모품신청", icon: "supply", section: "업무",
      show: anyOf(["supply_requests.view_all", "supply_requests.status", "supply_requests.claim"]),
      badge: supplyUnread,
    },
    // 데모예약 — 조회는 전 직원(쓰기만 demo_reservations.write로 게이팅)
    { href: "/admin/demo-reservations", label: "데모예약", icon: "calendarCheck", show: true, section: "업무" },
    { href: "/admin/equipment", label: "장비", icon: "equipment", show: can(perms, "equipment.manage"), section: "카탈로그" },
    { href: "/admin/inventory", label: "재고현황", icon: "inventory", show: can(perms, "equipment.manage"), section: "카탈로그" },
    { href: "/admin/consumables", label: "소모품", icon: "consumables", show: can(perms, "consumables.manage"), section: "카탈로그" },
    { href: "/admin/categories", label: "분류", icon: "categories", show: can(perms, "equipment.manage"), section: "카탈로그" },
    { href: "/admin/users", label: "사용자", icon: "users", show: can(perms, "users.manage"), section: "관리" },
  ];

  return (
    <div className="flex min-h-dvh bg-bg">
      {/* 배지·알림 주기 갱신(새 의뢰가 들어오면 새로고침 없이 사이드바 배지에 반영) */}
      <BadgePoller />
      {/* 사이드바 — 의뢰관리 화면에선 아이콘만 남기고 접힘(AdminSidebar) */}
      <AdminSidebar
        items={items.filter((it) => it.show)}
        isAdmin={isAdmin}
        initialOverride={initialOverride}
        userName={userName}
        userPosition={userPosition}
        avatarUrl={avatarUrl}
      />

      {/* 본문 영역 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 상단바 */}
        <header className="flex items-center gap-4 border-b border-border bg-surface px-6 py-3">
          <MobileNav items={items.filter((it) => it.show)} isAdmin={isAdmin} userName={userName} userPosition={userPosition} />
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
            <AccountMenu imageUrl={avatarUrl} name={userName} email={userEmail} position={userPosition} isAdmin={isAdmin} />
          </div>
        </header>

        <ConsoleMain>{children}</ConsoleMain>
      </div>
    </div>
  );
}
