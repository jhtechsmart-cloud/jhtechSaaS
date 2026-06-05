import Link from "next/link";
import { PortalIcon, type PortalIconName } from "./_components/PortalIcon";

// 공개 홈 — 고객 포털 첫인상. 히어로 + 3기능 아이콘 카드 + 이용안내 3단계.
// 카드 링크 접근명은 풀네임("견적 요청"…)을 유지(home-nav.spec 계약). 상단/탭바는 짧은 라벨이라 중복 없음.
const FEATURES: { href: string; icon: PortalIconName; title: string; desc: string }[] = [
  {
    href: "/equipment",
    icon: "quote",
    title: "견적 요청",
    desc: "UV 프린터·커팅기를 둘러보고 온라인으로 견적을 요청하세요.",
  },
  {
    href: "/support",
    icon: "service",
    title: "A/S 신청",
    desc: "보유 장비의 수리·점검을 사업자번호 조회로 간편하게 신청하세요.",
  },
  {
    href: "/supply",
    icon: "supply",
    title: "소모품 신청",
    desc: "보유 장비에 맞는 잉크·소모품을 선택해 신청하세요.",
  },
];

const STEPS: { title: string; desc: string }[] = [
  { title: "장비 선택·조회", desc: "장비를 고르거나 사업자등록번호로 보유 장비를 조회합니다." },
  { title: "온라인 신청", desc: "필요한 정보를 입력해 견적·A/S·소모품을 신청합니다." },
  { title: "담당자 연락", desc: "담당 영업이 내용을 확인하고 빠르게 연락드립니다." },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      {/* 히어로 */}
      <section className="flex flex-col items-start gap-3 py-6 sm:py-10">
        <span className="rounded-full bg-accent-soft px-3 py-1 text-small font-medium text-accent">
          (주)재현테크 고객센터
        </span>
        <h1 className="text-display font-semibold leading-tight text-text sm:text-[2.25rem]">
          UV 프린터·커팅기,
          <br />
          견적부터 A/S까지 온라인으로.
        </h1>
        <p className="max-w-xl text-body text-muted">
          장비 견적 요청, A/S 접수, 소모품 신청을 한곳에서. 사업자등록번호만으로 보유 장비를 불러와
          빠르게 신청하실 수 있습니다.
        </p>
      </section>

      {/* 3기능 아이콘 카드 */}
      <section className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-card transition-shadow hover:shadow-card-hover"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <PortalIcon name={f.icon} size={24} />
            </span>
            <span className="flex items-center gap-1 text-h2 font-semibold text-text">
              {f.title}
              <PortalIcon
                name="chevronRight"
                size={18}
                className="text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
              />
            </span>
            <span className="text-small text-muted">{f.desc}</span>
          </Link>
        ))}
      </section>

      {/* 이용안내 3단계 */}
      <section className="mt-12 rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-8">
        <h2 className="text-h2 font-semibold text-text">이용 안내</h2>
        <ol className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={i} className="flex flex-col gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-body font-semibold tabular-nums text-white">
                {i + 1}
              </span>
              <span className="text-body font-medium text-text">{s.title}</span>
              <span className="text-small text-muted">{s.desc}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
