import Link from "next/link";
import { requireQuotesWrite } from "@/lib/auth/guard";
import { signOut } from "@/app/login/actions";
import { listEquipmentForMatch } from "@/lib/quotes/equipment-match.server";
import type { QuoteCatalogItem } from "@/lib/quotes/form";
import { ManualQuoteForm } from "../_components/ManualQuoteForm";

// 수기 견적 작성 — 의뢰 없이 회사명부터. quotes.write 가드.
export default async function NewManualQuotePage() {
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

  const catalog: QuoteCatalogItem[] = (await listEquipmentForMatch()).map((e) => ({
    id: e.id, name: e.name, model: e.model, basePrice: e.basePrice, category: e.category,
    options: e.options.map((o) => ({ kind: o.kind, name: o.name })),
  }));

  return (
    <section className="flex max-w-3xl flex-col gap-4">
      <Link href="/admin/applications" className="text-small text-muted hover:text-text">
        ← 견적 목록
      </Link>
      <h1 className="text-h1 font-semibold text-text">수기 견적 작성</h1>
      <ManualQuoteForm catalog={catalog} />
    </section>
  );
}
