import { notFound } from "next/navigation";
import { requireUsersManage } from "@/lib/auth/guard";
import { getUser } from "@/lib/users/queries";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { signOut } from "@/app/login/actions";
import { EditUserClient } from "./EditUserClient";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
  const { id } = await params;
  const user = await getUser(id);
  if (!user) notFound();
  // #285 직인 미리보기 — approval-stamps는 비공개 버킷(users.manage 읽기) → 서버가 admin 클라로 10분 서명 URL.
  let stampUrl: string | null = null;
  if (user.approval_stamp_path) {
    const signed = await createSupabaseAdminClient().storage.from("approval-stamps").createSignedUrl(user.approval_stamp_path, 600);
    stampUrl = signed.data?.signedUrl ?? null;
  }
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-h1 font-semibold text-text">{user.name}</h1>
      <EditUserClient user={user} isSelf={user.id === access.userId} stampUrl={stampUrl} />
    </section>
  );
}
