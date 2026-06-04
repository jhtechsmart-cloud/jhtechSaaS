import Link from "next/link";
import { can } from "@jhtechsaas/shared";

// 전체 데이터 0일 때 상단 온보딩 — 다음 행동(고객→장비→영업계정) 안내.
// 데이터 0이 당분간 기본 화면(프로덕션 실데이터 ~0)이므로 1급 상태.
// 각 스텝은 sidebar nav와 동일 capability로 게이팅 — 권한 없는 사용자에게 막다른 링크 안 보임.
const STEPS = [
  {
    href: "/admin/customers",
    label: "고객·보유장비 등록",
    desc: "고객사와 보유 장비를 먼저 등록하면 A/S·소모품 신청이 실동작합니다.",
    requires: ["customers.edit", "customers.view_all"] as const,
  },
  {
    href: "/admin/equipment",
    label: "장비 카탈로그 추가",
    desc: "공개 카탈로그에 노출할 장비를 등록합니다.",
    requires: ["equipment.manage"] as const,
  },
  {
    href: "/admin/users",
    label: "영업 계정 추가",
    desc: "영업 담당자 계정을 만들면 담당자별 현황이 보입니다.",
    requires: ["users.manage"] as const,
  },
];

export function EmptyOnboarding({ permissions }: { permissions: readonly string[] }) {
  const steps = STEPS.filter((s) => s.requires.some((k) => can(permissions, k)));
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-6" data-testid="dashboard-empty">
      <p className="text-h2 font-semibold text-text">시작하기</p>
      <p className="text-small text-muted">아직 신청 데이터가 없습니다. 아래부터 시작하세요.</p>
      {steps.length === 0 ? (
        <p className="text-small text-muted">새 데이터를 등록할 권한이 없습니다. 관리자에게 문의하세요.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {steps.map((s, i) => (
            <Link key={s.href} href={s.href} className="flex items-start gap-3 rounded-md border border-border p-3 hover:bg-surface-2">
              <span className="font-mono text-small tabular-nums text-accent">{i + 1}</span>
              <span className="flex flex-col">
                <span className="text-body font-medium text-text">{s.label}</span>
                <span className="text-small text-muted">{s.desc}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
