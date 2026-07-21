import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { z } from "zod";
import { can } from "@jhtechsaas/shared";
import { requireEquipmentDetailRead } from "@/lib/auth/guard";
import { getEquipmentDetail } from "@/lib/equipment/queries";
import {
  countUnlinkedForEquipment,
  listEquipmentReports,
} from "@/lib/service-reports/equipment-history";
import { publicImageUrl } from "@/lib/equipment/images";
import { DetailTabs } from "./_components/DetailTabs";
import { HistoryTab } from "./_components/HistoryTab";

// #243 장비 상세 — 영업 전원 진입 허브(개요 + AS 이력 탭). 탭·필터 상태 = URL 쿼리.
// 가드 = 리포트 조회 3키 ∪ equipment.manage (⚠️ view_all 단독 요구 금지 — 영업 실권한은 view).
export const dynamic = "force-dynamic";

const won = (n: number) => `₩${n.toLocaleString("ko-KR")}`;

export default async function EquipmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  // 비UUID는 .single() DB 에러(22P02) 전에 404로.
  if (!z.guid().safeParse(id).success) notFound();

  const access = await requireEquipmentDetailRead();
  if (access.status === "forbidden") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-10">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">장비 카탈로그 조회 권한이 필요합니다.</p>
      </div>
    );
  }

  const detail = await getEquipmentDetail(id);
  if (!detail) notFound();

  const sp = await searchParams;
  const tab = sp.tab === "history" ? "history" : "overview";
  const canManage = can(access.permissions, "equipment.manage");
  // equipment.manage 단독 계정은 RLS로 리포트가 0건 — 조용한 빈 목록 대신 권한 안내를 띄운다.
  const canReadReports = (
    ["service_reports.write", "service_reports.view", "service_reports.view_all"] as const
  ).some((k) => can(access.permissions, k));

  const [reports, unlinkedCount] = canReadReports
    ? await Promise.all([listEquipmentReports(id), countUnlinkedForEquipment(id)])
    : [{ ok: true as const, data: [] }, 0];

  const included = detail.options.filter((o) => o.kind === "included");
  const extra = detail.options.filter((o) => o.kind === "extra");

  return (
    <section className="flex flex-col gap-4">
      {/* 탭 밖 고정 헤더 — 어느 탭에서도 장비 정체성 유지 */}
      <div className="flex items-start gap-4 rounded-md border border-border bg-surface p-4 shadow-card">
        {detail.photos[0] ? (
          <Image
            src={publicImageUrl(detail.photos[0])}
            alt=""
            width={72}
            height={72}
            className="h-18 w-18 shrink-0 rounded-sm object-cover"
            unoptimized
          />
        ) : (
          <div className="h-18 w-18 shrink-0 rounded-sm bg-surface-2" />
        )}
        <div className="min-w-0 flex-1">
          {/* 동명 모델 구분을 위해 truncate 금지(2줄 wrap) + 모델 코드 병기 */}
          <h1 className="line-clamp-2 text-h1 font-semibold text-text" title={detail.name}>
            {detail.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-small text-muted">
            {detail.model && <span className="font-mono tabular-nums">{detail.model}</span>}
            {detail.category && <span>{detail.category}</span>}
            <span
              className={`rounded-sm px-2 py-0.5 font-medium ${
                detail.status === "active" ? "bg-active/10 text-active" : "bg-surface-2 text-muted"
              }`}
            >
              {detail.status === "active" ? "판매중" : "비활성"}
            </span>
          </div>
        </div>
        {canManage && (
          <Link
            href={`/admin/equipment/${detail.id}/edit`}
            className="shrink-0 rounded-md border border-border px-4 py-2 text-small font-medium text-text hover:bg-surface-2"
          >
            수정
          </Link>
        )}
      </div>

      <DetailTabs active={tab} />

      {tab === "overview" ? (
        <div
          role="tabpanel"
          id="tabpanel-overview"
          aria-labelledby="tab-overview"
          className="flex flex-col gap-4"
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-md border border-border bg-surface p-4 shadow-card">
              <h2 className="text-small font-semibold text-muted">기본공급가</h2>
              <p className="mt-1 font-mono text-h2 font-semibold tabular-nums text-text">
                {won(detail.base_price)}
              </p>
              <p className="mt-0.5 text-micro text-muted">VAT 별도</p>
            </div>
            <div className="rounded-md border border-border bg-surface p-4 shadow-card">
              <h2 className="text-small font-semibold text-muted">재고</h2>
              {detail.inventory ? (
                <>
                  <p className="mt-1 font-mono text-h2 font-semibold tabular-nums text-text">
                    {detail.inventory.stock_qty.toLocaleString("ko-KR")}대
                  </p>
                  {detail.inventory.restock_date && (
                    <p className="mt-0.5 text-micro text-muted">
                      입고예정 {detail.inventory.restock_date}
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-1 text-body text-muted">—</p>
              )}
            </div>
            <div className="rounded-md border border-border bg-surface p-4 shadow-card">
              <h2 className="text-small font-semibold text-muted">등록 옵션</h2>
              <p className="mt-1 text-body text-text">
                포함 {included.length} · 추가 {extra.length}
              </p>
              {detail.options.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {detail.options.map((o, i) => (
                    <li
                      key={`${o.kind}-${o.name}-${i}`}
                      className={`rounded-full px-2.5 py-0.5 text-micro font-medium ${
                        o.kind === "included"
                          ? "bg-accent-soft text-accent"
                          : "bg-surface-2 text-muted"
                      }`}
                    >
                      {o.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="rounded-md border border-border bg-surface p-4 shadow-card">
            <h2 className="text-small font-semibold text-muted">사양</h2>
            {detail.specs.length === 0 ? (
              <p className="mt-2 text-body text-muted">—</p>
            ) : (
              <div className="mt-2 grid gap-4 md:grid-cols-2">
                {detail.specs.map((g, gi) => (
                  <div key={`${g.group}-${gi}`}>
                    {g.group && <h3 className="text-small font-semibold text-text">{g.group}</h3>}
                    <dl className="mt-1 divide-y divide-border/60">
                      {g.items.map((it, ii) => (
                        <div key={`${it.label}-${ii}`} className="flex gap-3 py-1.5 text-small">
                          <dt className="w-36 shrink-0 text-muted">{it.label}</dt>
                          <dd className="min-w-0 break-words text-text">{it.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div
          role="tabpanel"
          id="tabpanel-history"
          aria-labelledby="tab-history"
          className="flex flex-col gap-3"
        >
          {!canReadReports ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-10">
              <p className="text-body font-medium text-text">A/S 이력을 볼 권한이 없습니다</p>
              <p className="text-small text-muted">
                서비스 리포트 조회 권한이 필요합니다. 관리자에게 문의하세요.
              </p>
            </div>
          ) : !reports.ok ? (
            <p className="rounded-md border border-border bg-surface p-4 text-small text-danger">
              A/S 이력을 불러오지 못했습니다: {reports.error}
            </p>
          ) : (
            <HistoryTab rows={reports.data} unlinkedCount={unlinkedCount} />
          )}
        </div>
      )}
    </section>
  );
}
