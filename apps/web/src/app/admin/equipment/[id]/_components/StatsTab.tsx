// #244 통계 탭 — 서버 컴포넌트(인터랙션 없음, "use client" 금지).
// 계산은 전부 테스트된 순수함수(service-stats.ts)의 viewmodel — 카드는 바보 컴포넌트.
// 배치: 1행 Top10 전체폭 → 2행 주기+유무상 스탯 2열 → 3행 월별 전체폭. 블록 규칙: 1블록=1건, 비례 막대 금지.
import type { ReactNode } from "react";
import type { EquipmentReportRow } from "@/lib/equipment/history-filters";
import {
  SAMPLE_MIN_INTERVALS,
  SAMPLE_MIN_REPORTS,
  computeChargeStats,
  computeFaultStats,
  computeIntervalStats,
  computeMonthlyStats,
  daysToMonths,
  type ChargeStats,
  type FaultStats,
  type IntervalStats,
  type MonthlyStats,
} from "@/lib/equipment/service-stats";
import { UnlinkedBanner } from "./UnlinkedBanner";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

// 공통 카드 셸 — 제목 + 표본 뱃지(카드별 단위) + 참고용 칩(코랄) + 하단 설명 슬롯.
function StatsCard({
  title,
  sample,
  reference,
  footer,
  children,
}: {
  title: string;
  sample: string;
  reference: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-small font-semibold text-muted">{title}</h2>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-micro tabular-nums text-muted">
            {sample}
          </span>
          {reference && (
            <span className="rounded-full bg-coral-soft px-2.5 py-0.5 text-micro font-bold text-coral-text">
              참고용
            </span>
          )}
        </span>
      </div>
      <div className="mt-3">{children}</div>
      {footer && <p className="mt-3 text-micro text-muted">{footer}</p>}
    </section>
  );
}

// 블록 나열(1블록=1건) — 20블록 초과 +N. 장식이므로 aria-hidden, 값은 텍스트로 병기됨.
function UnitBlocks({ count, max = 20 }: { count: number; max?: number }) {
  const shown = Math.min(count, max);
  return (
    <span aria-hidden className="flex flex-wrap items-center gap-0.5">
      {Array.from({ length: shown }, (_, i) => (
        <span key={i} className="h-2.5 w-2.5 rounded-sm bg-accent" />
      ))}
      {count > max && <span className="ml-1 text-micro text-muted">+{count - max}</span>}
    </span>
  );
}

function FaultDistribution({ s }: { s: FaultStats }) {
  if (s.totalTags === 0) {
    return <p className="text-body text-muted">고장 분류가 기록된 리포트가 없습니다.</p>;
  }
  return (
    <ol className="flex flex-col gap-2.5">
      {s.top.map((t) => (
        <li key={t.fault}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 break-keep text-small font-medium text-text">{t.fault}</span>
            <span className="shrink-0 text-small tabular-nums text-muted">
              {t.count}건 ({t.pct}%)
            </span>
          </div>
          <div className="mt-1">
            <UnitBlocks count={t.count} />
          </div>
        </li>
      ))}
      {s.restKinds > 0 && (
        <li className="text-small text-muted">
          그 외 {s.restKinds}종 · {s.restCount}건
        </li>
      )}
    </ol>
  );
}

function RepeatIntervalCard({ s }: { s: IntervalStats }) {
  if (s.intervalCount === 0) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-body text-muted">반복 A/S 데이터 없음</p>
        <p className="text-micro text-muted">
          같은 장비에 발행 리포트가 2건 이상 쌓이면 계산됩니다.
          {s.unlinkedReportCount > 0 && ` (개별장비 미연결 ${s.unlinkedReportCount}건 제외)`}
        </p>
      </div>
    );
  }
  const med = s.medianDays as number;
  const mean = s.meanDays as number;
  return (
    <div className="flex flex-col gap-1">
      <p className="font-mono text-h2 font-semibold tabular-nums text-text">
        {Math.round(med)}일{" "}
        <span className="text-body font-medium text-muted">≈ {daysToMonths(med)}개월</span>
      </p>
      <p className="text-micro text-muted">중앙값 기준 · 평균 {Math.round(mean)}일 (≈ {daysToMonths(mean)}개월)</p>
      <p className="text-micro text-muted">
        간격 산출 가능 장비 {s.deviceCountWithIntervals}대 / 연결 장비 {s.linkedDeviceCount}대
        {s.unlinkedReportCount > 0 && ` · 미연결 ${s.unlinkedReportCount}건 제외`}
      </p>
    </div>
  );
}

function MonthlyBlocks({ s }: { s: MonthlyStats }) {
  const MAX = 12; // 레인 높이 고정(라벨 위치 불변) — 12블록 초과 +N (WeeklyUnitChart 규칙 계승)
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[640px] items-end gap-2">
        {s.months.map((m) => (
          <div key={m.ym} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-micro tabular-nums text-muted">{m.count}</span>
            <div
              aria-hidden
              className="flex h-40 w-full flex-col-reverse items-center gap-0.5"
              title={`${m.ym} · ${m.count}건`}
            >
              {Array.from({ length: Math.min(m.count, MAX) }, (_, i) => (
                <span key={i} className="h-3 w-4 rounded-sm bg-accent" />
              ))}
              {m.count > MAX && <span className="text-micro text-muted">+{m.count - MAX}</span>}
            </div>
            <span className={`text-micro ${m.current ? "font-semibold text-text" : "text-muted"}`}>
              {m.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChargeBreakdown({ s }: { s: ChargeStats }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-4">
        <p className="text-body text-text">
          유상 <span className="font-mono font-semibold tabular-nums">{s.paidCount}건</span>{" "}
          <span className="text-small text-muted">({s.paidPct}%)</span>
        </p>
        <p className="text-body text-text">
          무상 <span className="font-mono font-semibold tabular-nums">{s.freeCount}건</span>{" "}
          <span className="text-small text-muted">({s.freePct}%)</span>
        </p>
      </div>
      <p className="text-small text-text">
        유상 총 청구액{" "}
        <span className="font-mono font-semibold tabular-nums">
          {s.paidCount > 0 ? won(s.paidTotal) : "유상 없음"}
        </span>{" "}
        {s.paidCount > 0 && <span className="text-micro text-muted">(VAT 포함)</span>}
      </p>
      {s.freeCount > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {s.freeReasons.map((r) => (
            <li key={r.reason} className="flex justify-between gap-3 text-small">
              <span className="text-muted">{r.reason}</span>
              <span className="tabular-nums text-text">{r.count}건</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-muted">무상 없음</p>
      )}
    </div>
  );
}

export function StatsTab({
  rows,
  unlinkedCount,
  truncated,
}: {
  rows: EquipmentReportRow[];
  unlinkedCount: number;
  truncated: boolean;
}) {
  const now = new Date();
  const fault = computeFaultStats(rows);
  const interval = computeIntervalStats(rows);
  const monthly = computeMonthlyStats(rows, now, truncated);
  const charge = computeChargeStats(rows);
  const issuedCount = charge.reportCount;
  const voidedCount = charge.excludedVoided;
  const lowSample = issuedCount < SAMPLE_MIN_REPORTS;

  if (issuedCount === 0) {
    return (
      <div className="flex flex-col gap-3">
        <UnlinkedBanner count={unlinkedCount} />
        <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-10">
          <p className="text-body font-medium text-text">통계를 낼 발행 리포트가 없습니다</p>
          <p className="text-small text-muted">
            리포트는 현장 콘솔에서 기사가 확정하면 자동으로 쌓입니다.
            {voidedCount > 0 && ` (무효 ${voidedCount}건 제외)`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <UnlinkedBanner count={unlinkedCount} />
      {truncated && (
        <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-small text-muted">
          최근 300건 기준 통계입니다 — 과거 월·간격이 실제보다 적게 잡힐 수 있습니다.
        </p>
      )}
      {lowSample && (
        <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-small text-muted">
          표본이 적어 추세로 보기 어렵습니다 — 아래 숫자는 참고용입니다.
          {voidedCount > 0 && ` (무효 ${voidedCount}건 제외)`}
        </p>
      )}

      <StatsCard
        title="고장 유형 Top 10"
        sample={`태그 ${fault.totalTags}개`}
        reference={lowSample}
        footer={`백분율 분모 = 고장 태그 총 ${fault.totalTags}개 (리포트 ${fault.reportCount}건)`}
      >
        <FaultDistribution s={fault} />
      </StatsCard>

      <div className="grid gap-3 lg:grid-cols-2">
        <StatsCard
          title="평균 고장 주기"
          sample={`간격 표본 ${interval.intervalCount}개`}
          reference={lowSample || interval.intervalCount < SAMPLE_MIN_INTERVALS}
          footer="반복 A/S가 있던 장비만의 평균입니다 — 1건뿐인 장비는 계산에 들어가지 않습니다."
        >
          <RepeatIntervalCard s={interval} />
        </StatsCard>
        <StatsCard
          title="유상 / 무상"
          sample={`리포트 ${charge.reportCount}건`}
          reference={lowSample}
        >
          <ChargeBreakdown s={charge} />
        </StatsCard>
      </div>

      <StatsCard
        title="월별 A/S 발생 추이 (최근 12개월)"
        sample={`리포트 ${monthly.reportCount}건`}
        reference={lowSample}
        footer="블록 1개 = 리포트 1건 · 현재월은 진행 중 집계입니다."
      >
        <MonthlyBlocks s={monthly} />
      </StatsCard>
    </div>
  );
}
