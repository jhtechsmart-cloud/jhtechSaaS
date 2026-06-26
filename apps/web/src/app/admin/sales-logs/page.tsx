import Link from "next/link";
import { requireAnyConsoleCapability } from "@/lib/auth/guard";
import { signOut } from "@/app/login/actions";
import { listMySalesLogs } from "@/lib/sales-logs/queries";

// 내 영업일지 — 작성자(본인)가 남긴 영업일지 모아보기(최신순, 업체별 링크).
function formatKst(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default async function MySalesLogsPage() {
  const access = await requireAnyConsoleCapability();
  if (access.status === "forbidden") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <form action={signOut}>
          <button className="text-small text-accent underline">로그아웃</button>
        </form>
      </main>
    );
  }

  const logs = await listMySalesLogs(access.userId);

  return (
    <section className="mx-auto flex w-full max-w-[920px] flex-col gap-4">
      <div>
        <h1 className="text-h1 font-semibold text-text">내 영업일지</h1>
        <p className="text-small text-muted">내가 남긴 영업일지 모아보기 · 내부 메모(견적서·고객에 미노출)</p>
      </div>

      {logs.length === 0 ? (
        <p className="rounded-md border border-border bg-surface p-6 text-center text-small text-muted">
          아직 작성한 영업일지가 없습니다. 고객 상세 또는 견적 작성 화면에서 기록할 수 있습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {logs.map((l) => (
            <li key={l.id} className="rounded-md border border-border bg-surface p-4">
              <div className="mb-1 flex items-center justify-between gap-2 text-micro text-muted">
                {l.company_name ? (
                  <Link href={`/admin/customers/${l.company_id}`} className="font-medium text-accent hover:underline">
                    {l.company_name}
                  </Link>
                ) : (
                  <span className="text-muted">(접근 제한 업체)</span>
                )}
                <span>{formatKst(l.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap text-body text-text">{l.content}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
