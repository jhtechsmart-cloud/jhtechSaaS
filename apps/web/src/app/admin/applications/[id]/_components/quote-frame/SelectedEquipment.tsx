import type { MatchableEquipmentWithOptions } from "@/lib/quotes/equipment-match.server";
import { SectionHeader } from "./SectionHeader";

const won = (n: number) => `₩${n.toLocaleString("ko-KR")}`;
export type QuoteItemRow = { name: string; unitPrice: number; quantity: number };

// 선택 장비 — 시안 구조: 큰 이미지 + (카테고리칩·모델명) + 모델/카테고리/공급가/옵션 행(구분선) + 하단 견적번호 배지.
export function SelectedEquipment({
  items, matched, quoteNo,
}: {
  items: QuoteItemRow[];
  matched: (MatchableEquipmentWithOptions | null)[]; // items와 동일 인덱스
  quoteNo: string;
}) {
  const supplyTotal = items.reduce((s, r) => s + r.unitPrice * r.quantity, 0);
  const includedTotal = matched.reduce(
    (s, eq) => s + (eq?.options.filter((o) => o.kind === "included").length ?? 0),
    0,
  );
  return (
    <section className="rounded-lg border border-border/60 bg-surface p-5 shadow-sm">
      <SectionHeader title="선택 장비" meta={`기본 공급가 ${won(supplyTotal)} · 포함옵션 ${includedTotal}개`} />

      {/* 여러 장비 시 항목 간 구분선(divide-y) */}
      <ul className="flex flex-col divide-y divide-border">
        {items.map((it, i) => {
          const eq = matched[i];
          const included = eq?.options.filter((o) => o.kind === "included").length ?? 0;
          const totalOpts = eq?.options.length ?? 0;
          return (
            <li key={i} className="flex flex-col gap-5 py-5 first:pt-1 last:pb-1 sm:flex-row">
              {/* 이미지 — 더 크게(시안 비율 4:3, 데스크톱 320px) */}
              {eq?.photos[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={eq.photos[0]} alt={it.name} className="aspect-[4/3] w-full shrink-0 rounded-md object-cover sm:w-80" />
              ) : (
                <div className="flex aspect-[4/3] w-full shrink-0 items-center justify-center rounded-md bg-surface-2 text-small text-muted sm:w-80">
                  이미지 없음
                </div>
              )}

              {/* 상세 — 카테고리칩 · 모델명 · 스펙 행 */}
              <div className="min-w-0 flex-1">
                {eq?.category && (
                  <span className="inline-block rounded-full bg-accent-soft px-2.5 py-0.5 text-micro font-medium text-accent">{eq.category}</span>
                )}
                <div className="mt-2 text-display font-bold text-text">{it.name}</div>
                <dl className="mt-3 divide-y divide-border border-t border-border">
                  <SpecRow label="모델" value={eq?.model ?? it.name} />
                  <SpecRow label="카테고리" value={eq?.category ?? "-"} />
                  <SpecRow label="기본 공급가" value={`${won(it.unitPrice)} (VAT 별도)`} />
                  <SpecRow label="포함 / 추가 옵션" value={eq ? `${included}개 / ${totalOpts}개` : "-"} />
                </dl>
              </div>
            </li>
          );
        })}
      </ul>

      {/* 하단 — 견적번호 배지(시안: 우측 모노 pill) */}
      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <span className="text-small text-muted">견적번호</span>
        <span className="rounded-md border border-border px-3 py-1 font-mono tabular-nums text-small font-semibold text-text">{quoteNo}</span>
      </div>
    </section>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-4 py-2.5">
      <dt className="text-small text-muted">{label}</dt>
      <dd className="text-body font-semibold text-text">{value}</dd>
    </div>
  );
}
