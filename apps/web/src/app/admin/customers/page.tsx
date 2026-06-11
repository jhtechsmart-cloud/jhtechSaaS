import Link from "next/link";
import { requireCustomersEdit } from "@/lib/auth/guard";
import { listCompaniesPage, companyCounts } from "@/lib/customers/queries";
import { CompanyTable } from "./_components/CompanyTable";
import { signOut } from "@/app/login/actions";

// 서버 컴포넌트 — 첫 페이지(이름순 30건)+카운트만 fetch, 검색·필터·더보기는 클라가 서버 액션 호출.
// ⚠️ 전량 fetch 금지(PostgREST 1000행 캡 — 엑셀 이관 1,270건).
// ⚠️ admin/layout은 equipment.manage 전용 가드 → customers.edit 별도 확인 필수.
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

  const [{ rows, hasMore }, counts] = await Promise.all([
    listCompaniesPage({ scope: "all", sort: "name", offset: 0, limit: 30, userId: access.userId }),
    companyCounts(),
  ]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-h1 font-semibold text-text">고객</h1>
          <span className="text-small text-muted">
            전체 <span className="font-semibold tabular-nums text-text">{counts.total}</span>
            {" · "}배정 <span className="tabular-nums">{counts.assigned}</span>
            {" · "}미배정 <span className="tabular-nums">{counts.unassigned}</span>
          </span>
        </div>
        <Link
          href="/admin/customers/new"
          className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white"
        >
          + 새 고객
        </Link>
      </div>
      <CompanyTable initialRows={rows} initialHasMore={hasMore} userId={access.userId} />
    </section>
  );
}
