import { redirect } from "next/navigation";
import { getQuote } from "@/lib/quotes/queries";
import { requireApplicationsConsole } from "@/lib/auth/guard";

// 견적 상세는 의뢰 상세(견적 프레임)로 통합됨 — `?v=<quoteId>`로 해당 버전을 렌더한다.
// 기존 `/admin/quotes/[id]` 링크는 의뢰 상세로 리다이렉트해 중복 페이지를 없앤다.
export default async function QuoteRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireApplicationsConsole();
  const q = await getQuote(id);
  if (!q) redirect("/admin/applications");
  redirect(`/admin/applications/${q.application_id}?v=${id}`);
}
