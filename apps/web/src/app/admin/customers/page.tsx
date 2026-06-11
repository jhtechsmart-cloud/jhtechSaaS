import Link from "next/link";
import { Suspense } from "react";
import { requireCustomersEdit } from "@/lib/auth/guard";
import { listCustomerRegions, listAssignableStaff, customerKpiCounts } from "@/lib/customers/queries";
import { buttonVariants } from "@/components/ui/button";
import { CustomerListShell } from "./_components/list/CustomerListShell";
import { ExportCsvButton } from "./_components/list/ExportCsvButton";
import { signOut } from "@/app/login/actions";

// 고객 목록 — 데이터 테이블 + 통합 검색 + 빠른 필터. 모든 검색·필터·정렬·페이지네이션은
// 서버사이드(companies_list 뷰), 클라는 현재 페이지(기본 50건)만 수신. 상태=URL searchParams.
// ⚠️ admin/layout은 equipment.manage 가드 → customers.edit 별도 확인 필수.
export default async function CustomersListPage() {
  const access = await requireCustomersEdit();

  if (access.status === "forbidden") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">
          고객 관리 권한(customers.edit)이 필요합니다. 관리자에게 문의하세요.
        </p>
        <form action={signOut}>
          <button className="text-small text-accent underline">로그아웃</button>
        </form>
      </main>
    );
  }

  // 셸 보조 데이터(필터 옵션·첫사용 판단)만 서버에서 — 행 데이터는 클라(TanStack Query).
  const [regions, staffRaw, kpi] = await Promise.all([
    listCustomerRegions(),
    listAssignableStaff(),
    customerKpiCounts(),
  ]);
  const staff = staffRaw.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }));

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-h1 font-semibold text-text">고객 목록</h1>
          <p className="mt-0.5 text-small text-muted">
            거래처 검색·필터 — 전체 {kpi.total.toLocaleString("ko-KR")}곳
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Suspense fallback={null}>
            <ExportCsvButton />
          </Suspense>
          <Link href="/admin/customers/new" className={buttonVariants()}>
            + 고객 등록
          </Link>
        </div>
      </div>
      {/* Suspense: useSearchParams 사용 클라 트리(App Router 요구) */}
      <Suspense fallback={<div className="h-40 animate-pulse rounded-md bg-surface-2" />}>
        <CustomerListShell regions={regions} staff={staff} hasAnyCustomer={kpi.total > 0} />
      </Suspense>
    </section>
  );
}
