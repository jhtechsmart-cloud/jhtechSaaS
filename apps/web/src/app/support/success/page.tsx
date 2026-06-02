import Link from "next/link";
import { redirect } from "next/navigation";
import { asSeqNoSchema } from "@/lib/service-requests/schema";

// no(접수번호) 없이/형식위반 직접 진입 시 홈으로(새로고침·북마크 안전).
export default async function SupportSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ no?: string; assignee?: string }>;
}) {
  const { no, assignee } = await searchParams;
  if (!no || !asSeqNoSchema.safeParse(no).success) redirect("/");

  return (
    <main className="mx-auto w-full max-w-lg px-6 py-16 text-center">
      <h1 className="text-display font-semibold text-text">A/S 신청이 접수되었습니다</h1>
      <p className="mt-4 text-body text-muted">
        {assignee ? (
          <>담당 <span className="font-medium text-text">{assignee}</span>이(가) 영업일 1일 내 연락드립니다.</>
        ) : (
          <>담당자가 영업일 1일 내 연락드립니다.</>
        )}
      </p>
      <div className="mt-8 rounded-md border border-border bg-surface px-4 py-6">
        <div className="text-small text-muted">접수번호</div>
        <div className="mt-1 font-mono tabular-nums text-h1 text-text">{no}</div>
      </div>
      <Link href="/" className="mt-8 inline-block text-small text-muted hover:text-text">← 홈으로</Link>
    </main>
  );
}
