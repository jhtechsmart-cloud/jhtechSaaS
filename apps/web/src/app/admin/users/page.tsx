import Link from "next/link";
import { requireUsersManage } from "@/lib/auth/guard";
import { listUsers } from "@/lib/users/queries";
import { signOut } from "@/app/login/actions";
import { UserTable } from "./_components/UserTable";

// ⚠️ admin/layout은 equipment.manage 전용 가드 → users.manage 별도 확인 필수.
export default async function UsersListPage() {
  const access = await requireUsersManage();
  if (access.status === "forbidden") return <Forbidden />;
  const users = await listUsers();
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 font-semibold text-text">사용자</h1>
        <Link
          href="/admin/users/new"
          className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white"
        >
          + 새 계정
        </Link>
      </div>
      <UserTable users={users} />
    </section>
  );
}

function Forbidden() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6">
      <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
      <p className="text-small text-muted">
        사용자 관리 권한(users.manage)이 필요합니다. 관리자에게 문의하세요.
      </p>
      <form action={signOut}>
        <button className="text-small text-accent underline">로그아웃</button>
      </form>
    </main>
  );
}
