import Link from "next/link";
import { requireCustomersEdit } from "@/lib/auth/guard";
import { listCompanies } from "@/lib/customers/queries";
import { CompanyTable } from "./_components/CompanyTable";
import { signOut } from "@/app/login/actions";

// 서버 컴포넌트 — 업체 전량 fetch 후 클라이언트 테이블에 전달(검색·필터는 거기서).
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

  const items = await listCompanies();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 font-semibold text-text">고객</h1>
        <Link
          href="/admin/customers/new"
          className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white"
        >
          + 새 고객
        </Link>
      </div>
      <CompanyTable items={items} userId={access.userId} />
    </section>
  );
}
