import type { SupabaseClient } from "@supabase/supabase-js";
import { formatKstKoreanDate, matchEquipmentName, numberToKoreanAmount } from "@jhtechsaas/shared";
import { buildQuotePdf } from "./render-quote-pdf";
import { getFontDataUri, getStampDataUri } from "./assets";
import type { QuoteHtmlData, QuoteHtmlItem, QuoteHtmlIncluded } from "./quote-html";

type QuoteLine = { name: string; unitPrice: number; quantity: number; kind?: "included" | "extra" };

// 견적 줄(jsonb) → 타입 보정.
function parseLines(v: unknown): QuoteLine[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .map((r) => ({
      name: typeof r.name === "string" ? r.name : "",
      unitPrice: Number(r.unitPrice) || 0,
      quantity: Number(r.quantity) || 0,
      kind: r.kind === "included" || r.kind === "extra" ? r.kind : undefined,
    }));
}

// 스토리지 객체 → base64 data-URI(없으면 null).
async function storageDataUri(
  supabase: SupabaseClient,
  bucket: string,
  path: string | null,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  const ext = path.split(".").pop()?.toLowerCase();
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

// 장비 사양(jsonb SpecGroup[]) 행 — specs 임베드 결과 형식 방어용.
type EquipmentRow = {
  quote_banner_top: string | null;
  quote_banner_bottom: string | null;
  specs: unknown;
};

export async function processQuotePdfJob(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<void> {
  const quoteId = typeof payload.quote_id === "string" ? payload.quote_id : null;
  if (!quoteId) throw new Error("payload.quote_id 누락");

  // 1) 견적 + 신청기업 + 담당자
  const { data: quote, error } = await supabase
    .from("quotes")
    .select(
      "id, quote_no, items, options, supply_price, issued_at, application_id, " +
        "assignee:assignee_id(name, phone), application:application_id(company, equipment_id)",
    )
    .eq("id", quoteId)
    .single();
  if (error || !quote) throw new Error(`견적 조회 실패: ${error?.message ?? "없음"}`);

  // 임베디드 select라 supabase-js 추론 타입이 복합형 → unknown 경유 후 레코드로 좁힘(형식 방어).
  const q = quote as unknown as Record<string, unknown>;
  // 임베디드 to-one 관계는 supabase-js가 단일 객체로 추론하지만 런타임 형식 방어 캐스트.
  const app = q.application as { company?: string; equipment_id?: string | null } | null;
  const assignee = q.assignee as { name?: string; phone?: string | null } | null;

  const items = parseLines(q.items);
  const allOptions = parseLines(q.options);
  const includedOptions: QuoteHtmlIncluded[] = allOptions
    .filter((o) => o.kind === "included")
    .map((o) => ({ name: o.name, qtyLabel: `${o.quantity}ea` }));
  const extraOptions: QuoteHtmlItem[] = allOptions
    .filter((o) => o.kind !== "included")
    .map((o) => ({
      name: o.name,
      qtyLabel: `${o.quantity}ea`,
      unitPrice: o.unitPrice,
      amount: o.unitPrice * o.quantity,
    }));
  const htmlItems: QuoteHtmlItem[] = items.map((it) => ({
    name: it.name,
    qtyLabel: it.quantity === 1 ? "1SET" : `${it.quantity}SET`,
    unitPrice: it.unitPrice,
    amount: it.unitPrice * it.quantity,
  }));

  // 2) 장비(배너·specs): application.equipment_id 우선, 없으면 메인품목 이름매칭
  let equipment: EquipmentRow | null = null;
  if (app?.equipment_id) {
    const { data } = await supabase
      .from("equipment")
      .select("quote_banner_top, quote_banner_bottom, specs")
      .eq("id", app.equipment_id)
      .single();
    equipment = data ?? null;
  }
  if (!equipment && items[0]) {
    const { data: all } = await supabase
      .from("equipment")
      .select("id, name, model, quote_banner_top, quote_banner_bottom, specs")
      .eq("status", "active");
    const list = (all ?? []) as (EquipmentRow & { name: string; model: string | null })[];
    const m = matchEquipmentName(items[0].name, list);
    if (m) equipment = m;
  }

  // specs(jsonb SpecGroup[]) → 평면 그룹(label/value). 형식 방어.
  const specGroups = Array.isArray(equipment?.specs)
    ? (equipment.specs as { group?: string; items?: { label?: string; value?: string }[] }[])
        .map((g) => ({
          group: typeof g.group === "string" ? g.group : "",
          items: (g.items ?? []).map((i) => ({ label: i.label ?? "", value: i.value ?? "" })),
        }))
        .filter((g) => g.items.length > 0)
    : [];

  const supplyPrice = Number(q.supply_price) || 0;
  // issued_at은 UTC ISO — KST 변환 없이 slice하면 KST 자정~09시 발행분이 전날 날짜로 인쇄된다.
  const issued = typeof q.issued_at === "string" ? q.issued_at : null;
  const issuedDateLabel = (issued && formatKstKoreanDate(issued)) || "";

  const data: QuoteHtmlData = {
    quoteNo: q.quote_no as string,
    issuedDateLabel,
    assigneeName: assignee?.name ?? "담당자",
    assigneePhone: assignee?.phone ?? null,
    recipient: app?.company ?? "고객",
    supplyPrice,
    koreanAmount: numberToKoreanAmount(supplyPrice),
    items: htmlItems,
    includedOptions,
    extraOptions,
    specGroups,
    notes: [
      "상기금액은 부가세(V.A.T) 별도 금액입니다.",
      "본 견적서의 유효기간은 발행일로부터 1개월입니다.",
    ],
    bannerTopDataUri: await storageDataUri(
      supabase,
      "equipment-images",
      equipment?.quote_banner_top ?? null,
    ),
    bannerBottomDataUri: await storageDataUri(
      supabase,
      "equipment-images",
      equipment?.quote_banner_bottom ?? null,
    ),
    stampDataUri: await getStampDataUri(),
    fontDataUri: await getFontDataUri(),
  };

  // 3) 렌더 → 업로드 → pdf_url
  const pdf = await buildQuotePdf(data);
  const path = `${quoteId}.pdf`;
  const up = await supabase.storage
    .from("quote-pdfs")
    .upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (up.error) throw new Error(`PDF 업로드 실패: ${up.error.message}`);
  const { error: uErr } = await supabase.from("quotes").update({ pdf_url: path }).eq("id", quoteId);
  if (uErr) throw new Error(`pdf_url 기록 실패: ${uErr.message}`);
}
