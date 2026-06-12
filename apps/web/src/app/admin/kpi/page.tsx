import { requireAnyConsoleCapability } from "@/lib/auth/guard";

// KPI 디자인 시안 — Stripe 결(넉넉한 여백·큰 숫자·차분한 색·좌측정렬·강조 1곳).
// 데이터는 전부 샘플(프로덕션 집계 0이라 디자인 검증용). 실집계 배선은 후속.
// 프로젝트 v3 토큰(globals.css) 사용: Plus Jakarta+Pretendard·인디고 액센트·시맨틱 색.

// ── 샘플 데이터 ─────────────────────────────────────────────
const REVENUE_12M = [62, 71, 68, 84, 79, 92, 88, 103, 96, 112, 118, 124]; // 백만원 단위
const REVENUE_MONTHS = ["7", "8", "9", "10", "11", "12", "1", "2", "3", "4", "5", "6"];

const ASSIGNEE_REVENUE = [
  { name: "김영업", value: 420 },
  { name: "이세일", value: 380 },
  { name: "박상담", value: 260 },
  { name: "정매니저", value: 180 },
];

const REQUEST_MIX = [
  { label: "접수", value: 84, color: "#34B8A5" },
  { label: "진행중", value: 62, color: "#BFE6C1" },
  { label: "완료", value: 168, color: "#176455" },
  { label: "보류", value: 14, color: "#C8D8D2" },
];

const TOP_CONSUMABLES = [
  { name: "UV 잉크 (CMYK 세트)", model: "XTRA-INK-4C", count: 18 },
  { name: "프린트 헤드 i3200-U1", model: "EPS-i3200", count: 9 },
  { name: "클리닝 솔루션 1.5L", model: "CLN-1500", count: 7 },
  { name: "원단 흡착 필터", model: "FLT-A2", count: 6 },
];

// ── 헬퍼 ───────────────────────────────────────────────────
function won(millions: number): string {
  if (millions >= 1000) return `₩${(millions / 1000).toFixed(2)}B`;
  return `₩${millions}M`;
}

// 12개 값 → 부드러운 영역 path(d) + 라인 path. viewBox 0..100 x 0..40.
function buildPaths(values: number[]) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const W = 100;
  const H = 40;
  const pad = 4;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - pad - ((v - min) / span) * (H - pad * 2);
    return [x, y] as const;
  });
  // 부드러운 곡선(Catmull-Rom → 베지어 근사)
  let line = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[Math.max(0, i - 1)];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const [x3, y3] = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = x1 + (x2 - x0) / 6;
    const c1y = y1 + (y2 - y0) / 6;
    const c2x = x2 - (x3 - x1) / 6;
    const c2y = y2 - (y3 - y1) / 6;
    line += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
  }
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;
  return { line, area, last: pts[pts.length - 1] };
}

// 도넛 세그먼트 — 각 항목의 비율(pct)과 누적 시작 오프셋(strokeDashoffset용)을 미리 계산.
// 렌더 중 변수 재할당(react-hooks/immutability) 회피용으로 컴포넌트 밖 순수 함수로 분리.
function buildDonut(values: number[], total: number) {
  let offset = 0;
  return values.map((v) => {
    const pct = (v / total) * 100;
    const seg = { pct, offset };
    offset += pct;
    return seg;
  });
}

export default async function KpiPage() {
  const access = await requireAnyConsoleCapability();
  if (access.status === "forbidden") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface p-10">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">콘솔 접근 권한이 필요합니다.</p>
      </div>
    );
  }

  const { line, area, last } = buildPaths(REVENUE_12M);
  const assigneeMax = Math.max(...ASSIGNEE_REVENUE.map((a) => a.value));
  const mixTotal = REQUEST_MIX.reduce((s, m) => s + m.value, 0);
  const donutSegments = buildDonut(REQUEST_MIX.map((m) => m.value), mixTotal);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-16 py-4">
      {/* 헤더 — 좌측정렬, 넉넉한 여백 */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-display font-semibold tracking-tight text-text">KPI</h1>
          <p className="max-w-[50ch] text-body text-muted">
            견적·A/S·소모품 운영 지표를 한눈에. 추세와 담당자별 성과를 추적합니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-small text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-2" />
            샘플 데이터
          </span>
          <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-small font-medium text-text">
            이번 달
            <span className="text-muted">▾</span>
          </span>
        </div>
      </header>

      {/* 히어로 지표 — 카드 남발 대신 구분선으로 나눈 한 줄(8pt 그리드, 큰 mono 숫자) */}
      <section className="grid grid-cols-2 gap-x-8 gap-y-10 lg:grid-cols-4">
        <Metric label="이번 달 매출" value="₩1.24B" delta="+12.4%" deltaLabel="지난달 대비" dir="up" lead />
        <Metric label="견적 요청" value="328" unit="건" delta="+3.1%" deltaLabel="지난달 대비" dir="up" />
        <Metric label="견적 전환율" value="24.3" unit="%" delta="-1.2%p" deltaLabel="지난달 대비" dir="down" />
        <Metric label="A/S 미처리" value="12" unit="건" delta="평균 1.8일" deltaLabel="처리 소요" dir="flat" />
      </section>

      {/* 매출 추이 — 주된 시각 요소, 단일 인디고(강조 10%) */}
      <section className="flex flex-col gap-6">
        <div className="flex items-baseline justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-h2 font-semibold text-text">매출 추이</h2>
            <p className="text-small text-muted">최근 12개월 · 단위 백만원</p>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-h1 font-semibold tabular-nums text-text">{won(REVENUE_12M.at(-1)!)}</span>
            <span className="inline-flex items-center gap-1 text-small font-medium text-active">▲ 12.4%</span>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6">
          <div className="relative h-56 w-full">
            <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-full w-full overflow-visible">
              <defs>
                <linearGradient id="kpiArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.16" />
                  <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* 가로 기준선 4개(차분한 보더색) */}
              {[10, 20, 30].map((y) => (
                <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="var(--color-border)" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
              ))}
              <path d={area} fill="url(#kpiArea)" />
              <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={last[0]} cy={last[1]} r="3" fill="var(--color-accent)" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
          <div className="mt-4 flex justify-between px-1">
            {REVENUE_MONTHS.map((m, i) => (
              <span key={i} className="font-mono text-micro tabular-nums text-muted">{m}</span>
            ))}
          </div>
        </div>
      </section>

      {/* 2열 — 담당자별 매출(가로 막대) / 신청 상태 분포(도넛) */}
      <section className="grid grid-cols-1 gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-6 rounded-xl border border-border bg-surface p-6">
          <h2 className="text-h2 font-semibold text-text">담당자별 매출</h2>
          <div className="flex flex-col gap-5">
            {ASSIGNEE_REVENUE.map((a) => (
              <div key={a.name} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-body font-medium text-text">{a.name}</span>
                  <span className="font-mono text-body tabular-nums text-muted">{won(a.value)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(a.value / assigneeMax) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-6 rounded-xl border border-border bg-surface p-6">
          <h2 className="text-h2 font-semibold text-text">신청 상태 분포</h2>
          <div className="flex items-center gap-6">
            <div className="relative h-36 w-36 shrink-0">
              <svg viewBox="0 0 36 36" className="h-36 w-36 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-surface-2)" strokeWidth="4" />
                {REQUEST_MIX.map((m, i) => {
                  const { pct, offset } = donutSegments[i];
                  return (
                    <circle
                      key={m.label}
                      cx="18"
                      cy="18"
                      r="15.5"
                      fill="none"
                      stroke={m.color}
                      strokeWidth="4"
                      pathLength={100}
                      strokeDasharray={`${pct} ${100 - pct}`}
                      strokeDashoffset={-offset}
                    />
                  );
                })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-h1 font-bold tabular-nums text-text">{mixTotal}</span>
                <span className="text-micro text-muted">건</span>
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-2.5">
              {REQUEST_MIX.map((m) => (
                <div key={m.label} className="flex items-center justify-between text-small">
                  <span className="inline-flex items-center gap-2 text-muted">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: m.color }} />
                    {m.label}
                  </span>
                  <span className="font-mono tabular-nums text-text">{m.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 소모품 재주문 상위 — 미니 테이블 */}
      <section className="flex flex-col gap-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-h2 font-semibold text-text">소모품 재주문 상위</h2>
          <span className="text-small text-muted">이번 달 · 56건</span>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {TOP_CONSUMABLES.map((c, i) => (
            <div
              key={c.model}
              className={`flex items-center gap-4 px-6 py-4 ${i > 0 ? "border-t border-border" : ""}`}
            >
              <span className="font-mono text-small tabular-nums text-muted">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body font-medium text-text">{c.name}</span>
                <span className="font-mono text-micro text-muted">{c.model}</span>
              </span>
              <span className="font-mono text-body font-semibold tabular-nums text-text">{c.count}<span className="ml-0.5 text-small font-normal text-muted">건</span></span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// 히어로 지표 — 작은 라벨 + 큰 mono 숫자 + 델타. lead면 강조선(인디고)으로 primary 1곳만.
function Metric({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  dir,
  lead = false,
}: {
  label: string;
  value: string;
  unit?: string;
  delta: string;
  deltaLabel: string;
  dir: "up" | "down" | "flat";
  lead?: boolean;
}) {
  const deltaColor = dir === "up" ? "text-active" : dir === "down" ? "text-danger" : "text-muted";
  const arrow = dir === "up" ? "▲ " : dir === "down" ? "▼ " : "";
  return (
    <div className={`flex flex-col gap-2 ${lead ? "border-l-2 border-accent pl-4" : "pl-4 border-l border-border"}`}>
      <span className="text-small font-medium text-muted">{label}</span>
      <span className="flex items-baseline gap-1">
        <span className="font-mono text-4xl font-semibold leading-none tabular-nums text-text">{value}</span>
        {unit && <span className="text-h2 font-medium text-muted">{unit}</span>}
      </span>
      <span className="flex items-center gap-1.5 text-small">
        <span className={`font-medium ${deltaColor}`}>{arrow}{delta}</span>
        <span className="text-muted">{deltaLabel}</span>
      </span>
    </div>
  );
}
