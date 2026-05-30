import type { ReactNode } from "react";
import { requireEquipmentManage } from "@/lib/auth/guard";
import { signOut } from "@/app/login/actions";

// 콘솔 셸 — 사이드바196 + 상단바. requireEquipmentManage가 미인증을 /login으로 보내고,
// 권한 없는 로그인 사용자는 403 패널을 렌더(AC2).
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const access = await requireEquipmentManage();

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
          <a
            href="/admin/equipment"
            className="rounded-md bg-surface-2 px-3 py-2 text-body font-medium text-text"
          >
            장비
          </a>
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
