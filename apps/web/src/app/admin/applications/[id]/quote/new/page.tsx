import Link from "next/link";
import { requireQuotesWrite } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { getQuote } from "@/lib/quotes/queries";
import { parseQuoteLines, type QuoteRow } from "@/lib/quotes/form";
import { QuoteForm } from "../../_components/QuoteForm";

// 견적 작성 — 기존 의뢰 위에. quotes.write 가드 + 의뢰 존재 확인 후 폼 렌더.
// ?from=<quoteId>면 그 견적 줄을 프리필(재발행) — 같은 의뢰의 견적만 허용.
export default async function NewQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const access = await requireQuotesWrite();
  if (access.status === "forbidden") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">견적 작성 권한(quotes.write)이 필요합니다.</p>
        <form action={signOut}>
          <button className="text-small text-accent underline">로그아웃</button>
        </form>
      </main>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: app } = await supabase
    .from("applications")
    .select("company")
    .eq("id", id)
    .single();
  if (!app) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body text-text">의뢰를 찾을 수 없습니다.</p>
        <Link href="/admin/applications" className="text-small text-accent">← 목록으로</Link>
      </div>
    );
  }

  // 재발행 프리필 — 같은 의뢰의 견적 줄만 초기값으로(타 의뢰 견적 주입 방지).
  let initialItems: QuoteRow[] | undefined;
  let initialOptions: QuoteRow[] | undefined;
  if (from) {
    const src = await getQuote(from);
    if (src && src.application_id === id) {
      initialItems = parseQuoteLines(src.items);
      initialOptions = parseQuoteLines(src.options);
    }
  }

  return (
    <section className="flex max-w-2xl flex-col gap-4">
      <Link href={`/admin/applications/${id}`} className="text-small text-muted hover:text-text">
        ← 의뢰로
      </Link>
      <h1 className="text-h1 font-semibold text-text">
        {from ? "견적 재발행" : "견적 작성"} — {app.company}
      </h1>
      <QuoteForm applicationId={id} initialItems={initialItems} initialOptions={initialOptions} />
    </section>
  );
}
