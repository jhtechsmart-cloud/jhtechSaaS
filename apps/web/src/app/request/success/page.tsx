import Link from "next/link";
import { redirect } from "next/navigation";

// no(접수번호) 없이 직접 진입하면 카탈로그로. (새로고침·북마크 안전)
export default async function RequestSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ no?: string }>;
}) {
  const { no } = await searchParams;
  if (!no) redirect("/equipment");

  return (
    <main className="mx-auto w-full max-w-lg px-6 py-16 text-center">
      <h1 className="text-display font-semibold text-text">견적 요청이 접수되었습니다</h1>
      <p className="mt-4 text-body text-muted">담당자가 확인 후 연락드리겠습니다.</p>
      <div className="mt-8 rounded-md border border-border bg-surface px-4 py-6">
        <div className="text-small text-muted">접수번호</div>
        <div className="mt-1 font-mono tabular-nums text-h1 text-text">{no}</div>
      </div>
      <Link href="/equipment" className="mt-8 inline-block text-small text-muted hover:text-text">
        ← 카탈로그로
      </Link>
    </main>
  );
}
