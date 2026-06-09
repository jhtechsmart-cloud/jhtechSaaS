import { SectionHeader } from "./SectionHeader";

// 후속 슬라이스 기능 자리 — 비활성 "준비중". 가짜 데이터 없음(레이아웃만).
export function SalesLogPlaceholder() {
  return (
    <section className="rounded-lg border border-dashed border-border bg-surface p-5 opacity-70">
      <SectionHeader title="영업일지" meta="내부용 · 준비중(후속)" />
      <div className="rounded-sm bg-surface-2 px-3 py-6 text-center text-small text-muted">후속 슬라이스에서 활성화됩니다.</div>
    </section>
  );
}
export function SpecialNotesPlaceholder() {
  return (
    <section className="rounded-lg border border-dashed border-border bg-surface p-5 opacity-70">
      <SectionHeader title="특기사항" meta="견적서 출력용 · 준비중(후속)" />
      <div className="rounded-sm bg-surface-2 px-3 py-6 text-center text-small text-muted">후속 슬라이스에서 활성화됩니다.</div>
    </section>
  );
}
