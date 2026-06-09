import Link from "next/link";
import type { ReactNode } from "react";
import { SectionHeader } from "./SectionHeader";

type Field = { label: string; value: string | null; mono?: boolean };

// 신청기업 정보 — 신청이 실제 가진 항목(기본정보 3열) + 요청장비.
// 담당자·업태·업종·장부명·전화1/2·팩스·실제주소는 거래처 장부(고객 마스터) 전용 → 견적 화면 미표시.
export function ApplicantInfo({
  companyId,
  basic,
  equipmentName,
  requirements,
  headerAction,
}: {
  companyId: string | null;
  basic: Field[]; // 신청이 가진 기본 항목 — 3열 그리드
  equipmentName: string | null;
  requirements: string | null;
  headerAction?: ReactNode; // 고객등록 버튼 등 — 제목 라인 오른쪽
}) {
  return (
    <section className="rounded-lg border border-border/60 bg-surface p-5 shadow-sm">
      {/* 제목 옆 등록/미등록 배지 + 우측: 등록고객=통합이력 링크 / 미등록=고객등록 버튼(상호배타) */}
      <SectionHeader
        title="신청기업 정보"
        meta="접수 시 자동 수집"
        action={
          companyId ? (
            <Link href={`/admin/customers/${companyId}`} className="shrink-0 text-small font-medium text-accent hover:underline">
              통합 이력 보기 →
            </Link>
          ) : (
            headerAction
          )
        }
        badge={
          companyId ? (
            <span className="rounded-full bg-[#16a34a]/12 px-2 py-0.5 text-micro font-medium text-[#16a34a]">등록 고객</span>
          ) : (
            <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-micro font-medium text-amber-700">미등록 고객</span>
          )
        }
      />

      {/* 기본정보 — 한 줄당 3개 */}
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-3">
        {basic.map((f) => (
          <FieldCell key={f.label} f={f} />
        ))}
      </div>

      {/* 요청 장비 — 별도 구분 블록(라벨/값 동일 크기 통일) */}
      <div className="mt-4 border-t border-border pt-3">
        <div className="text-micro font-medium uppercase tracking-wide text-muted">요청 장비</div>
        <div className="mt-1 text-body font-medium text-text">{equipmentName || "-"}</div>
        {requirements && (
          <div className="mt-2 rounded-sm border-l-2 border-navy bg-surface-2 p-3">
            <p className="whitespace-pre-wrap text-body text-text">{requirements}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function FieldCell({ f }: { f: Field }) {
  return (
    <div className="min-w-0">
      <div className="text-micro text-muted">{f.label}</div>
      <div className={`mt-0.5 truncate text-body text-text ${f.mono ? "font-mono tabular-nums" : ""}`}>{f.value || "-"}</div>
    </div>
  );
}
