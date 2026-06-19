import Link from "next/link";
import { requireQuotesWrite } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { getQuote } from "@/lib/quotes/queries";
import { parseQuoteLines, type QuoteRow, type QuoteCatalogItem } from "@/lib/quotes/form";
import { listEquipmentForMatch } from "@/lib/quotes/equipment-match.server";
import { matchEquipmentName } from "@/lib/quotes/equipment-match";
import { QuoteForm } from "../../_components/QuoteForm";
import { ApplicationContext } from "../../_components/ApplicationContext";

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
    .select("company, equipment_id, fields")
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

  // 장비 카탈로그(클라 직렬화 안전) — 폼 드롭다운·포함옵션 체크박스용.
  const catalog: QuoteCatalogItem[] = (await listEquipmentForMatch()).map((e) => ({
    id: e.id, name: e.name, model: e.model, basePrice: e.basePrice, category: e.category,
    options: e.options.map((o) => ({ kind: o.kind, name: o.name })),
    specs: e.specs,
  }));

  let initialItems: QuoteRow[] | undefined;
  let initialOptions: QuoteRow[] | undefined;
  let initialSpecSelection: string[] | undefined;
  if (from) {
    // 재발행 프리필 — 같은 의뢰의 견적 줄만 초기값으로(타 의뢰 견적 주입 방지).
    const src = await getQuote(from);
    if (src && src.application_id === id) {
      initialItems = parseQuoteLines(src.items);
      initialOptions = parseQuoteLines(src.options);
      // 사양 선택도 복원(배열이면 그대로, null=구 견적이면 undefined → 폼이 장비 기본으로).
      initialSpecSelection = Array.isArray(src.spec_selection)
        ? src.spec_selection.filter((x): x is string => typeof x === "string")
        : undefined;
    }
  } else {
    // 새 견적 — 고객이 신청 시 고른 장비를 기본 셋팅(담당자 재입력·오선택 방지).
    // equipment_id 우선, 없으면 fields.equipment_name 이름매칭. 포함옵션은 폼이 자동 전체체크.
    const eqName = (app.fields as { equipment_name?: string } | null)?.equipment_name ?? null;
    const reqEq =
      (typeof app.equipment_id === "string" ? catalog.find((e) => e.id === app.equipment_id) : undefined) ??
      (eqName ? matchEquipmentName(eqName, catalog) : null) ??
      null;
    if (reqEq) initialItems = [{ name: reqEq.name, unitPrice: reqEq.basePrice, quantity: 1 }];
  }

  return (
    <section className="mx-auto flex w-full max-w-[1180px] flex-col gap-4">
      <Link href={`/admin/applications/${id}`} className="text-small text-muted hover:text-text">
        ← 의뢰로
      </Link>
      <h1 className="text-h1 font-semibold text-text">
        {from ? "견적 재발행" : "견적 작성"} — {app.company}
      </h1>
      <QuoteForm
        applicationId={id}
        catalog={catalog}
        initialItems={initialItems}
        initialOptions={initialOptions}
        initialSpecSelection={initialSpecSelection}
        contextSlot={<ApplicationContext id={id} />}
      />
    </section>
  );
}
