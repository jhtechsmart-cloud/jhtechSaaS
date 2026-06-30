import Link from "next/link";
import { z } from "zod";
import { requireQuotesWrite } from "@/lib/auth/guard";
import { signOut } from "@/app/login/actions";
import { listEquipmentForMatch } from "@/lib/quotes/equipment-match.server";
import type { QuoteCatalogItem } from "@/lib/quotes/form";
import type { QuoteCustomer } from "@/lib/quotes/customer-search";
import { getCompany } from "@/lib/customers/queries";
import { ManualQuoteForm } from "../_components/ManualQuoteForm";

// company 행(loose typed)에서 QuoteCustomer 추출 — 직접 입력 폴백 안전.
function toQuoteCustomer(row: Record<string, unknown>): QuoteCustomer | undefined {
  const id = typeof row.id === "string" ? row.id : null;
  const name = typeof row.name === "string" ? row.name : null;
  if (!id || !name) return undefined;
  const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
  return {
    id,
    name,
    ceo: str(row.ceo),
    phone: str(row.phone) ?? str(row.mobile),
    email: str(row.email),
    bizNo: str(row.biz_no),
  };
}

// 수기 견적 작성 — 의뢰 없이 회사명부터. quotes.write 가드.
// ?company=<id>(고객상세 "새 견적" 딥링크)면 그 고객 정보를 프리필 + 연결.
export default async function NewManualQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
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
    image: e.photos[0] ?? null, // 대표 사진(선택 장비 카드 미리보기)
    // 장비 옵션은 전부 포함옵션(이름+가격). 구 'extra'도 포함으로 흡수.
    options: e.options.map((o) => ({ name: o.name, price: Number(o.price) })),
    specs: e.specs,
  }));

  // 딥링크 고객 프리필 — company가 유효 guid이고 조회되면 initialCustomer로 주입(없으면 빈 폼).
  const { company } = await searchParams;
  let initialCustomer: QuoteCustomer | undefined;
  if (company && z.guid().safeParse(company).success) {
    const row = await getCompany(company);
    if (row) initialCustomer = toQuoteCustomer(row as Record<string, unknown>);
  }

  return (
    <section className="flex flex-col gap-4">
      <Link href="/admin/applications" className="text-small text-muted hover:text-text">
        ← 견적 목록
      </Link>
      <h1 className="text-h1 font-semibold text-text">수기 견적 작성</h1>
      <ManualQuoteForm catalog={catalog} initialCustomer={initialCustomer} currentUserId={access.userId} />
    </section>
  );
}
