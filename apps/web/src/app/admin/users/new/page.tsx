import { requireUsersManage } from "@/lib/auth/guard";
import { signOut } from "@/app/login/actions";
import { NewUserClient } from "./NewUserClient";

export default async function NewUserPage() {
  const access = await requireUsersManage();
  if (access.status === "forbidden") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">사용자 관리 권한(users.manage)이 필요합니다.</p>
        <form action={signOut}>
          <button className="text-small text-accent underline">로그아웃</button>
        </form>
      </main>
    );
  }
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-h1 font-semibold text-text">새 계정</h1>
      <NewUserClient />
    </section>
  );
}
