"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FileText, Package, Wrench, Box } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { ApplicationStatusBadge } from "@/lib/application-status";
import { StatusBadge } from "@/lib/request-status";
import type {
  HistoryApplication,
  HistoryServiceRequest,
  HistorySupplyRequest,
} from "@/lib/customers/history";
import { EmptyState } from "./EmptyState";
import { activeTabFrom, type ActivityTabKey } from "./CustomerKpiStrip";

// 우측 메인: 거래 활동 탭 — 견적/보유장비/A/S/소모품. ?tab= 동기화(KPI 스트립과 공유).
// 패널 최소 높이 300px(탭 전환 시 레이아웃 점프 방지).

export type EquipmentRow = {
  id: string;
  label: string | null;
  serial_no: string | null;
  purchased_at: string | null;
  equipment: { name?: string; model?: string } | null;
};

function equipmentLabel(e: EquipmentRow): string {
  if (e.equipment?.name) {
    return e.equipment.model ? `${e.equipment.name} (${e.equipment.model})` : e.equipment.name;
  }
  return e.label ?? "(미지정 장비)";
}

const dateOnly = (v: string): string => v.slice(0, 10);

// 데이터 행 — 좌측 아이콘 타일(38px) + 2줄 + 우측 배지·날짜. 행 클릭 시 레코드 상세.
function ActivityRow({
  href,
  icon,
  title,
  sub,
  right,
}: {
  href: string | null;
  icon: React.ReactNode;
  title: string;
  sub: string | null;
  right: React.ReactNode;
}) {
  const body = (
    <>
      <span className="flex size-[38px] shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-body font-semibold tabular-nums text-text">{title}</span>
        {sub && <span className="block truncate text-small text-muted">{sub}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2">{right}</span>
    </>
  );
  const cls = "flex w-full items-center gap-3 border-b border-border py-2.5 last:border-b-0";
  return href ? (
    <Link href={href} className={`${cls} hover:bg-surface-2`}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function CustomerActivityTabs({
  applications,
  equipment,
  serviceRequests,
  supplyRequests,
  counts,
}: {
  applications: HistoryApplication[];
  equipment: EquipmentRow[];
  serviceRequests: HistoryServiceRequest[];
  supplyRequests: HistorySupplyRequest[];
  counts: Record<ActivityTabKey, number>;
}) {
  const searchParams = useSearchParams();
  const active = activeTabFrom(searchParams.get("tab"));

  function onChange(value: string) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("tab", value);
    // 표시 전용 동기화 — 서버 재조회 없는 shallow 갱신(useSearchParams는 native history와 연동됨)
    window.history.replaceState(null, "", `?${sp.toString()}`);
  }

  return (
    <Card className="gap-0 py-4 shadow-card">
      <CardContent className="px-4">
        <Tabs value={active} onValueChange={onChange}>
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabTriggerWithCount value="quotes" label="견적" count={counts.quotes} active={active} />
            <TabTriggerWithCount value="equipment" label="보유장비" count={counts.equipment} active={active} />
            <TabTriggerWithCount value="as" label="A/S" count={counts.as} active={active} />
            <TabTriggerWithCount value="supply" label="소모품" count={counts.supply} active={active} />
          </TabsList>

          <TabsContent value="quotes" className="min-h-[300px] pt-2">
            {applications.length === 0 ? (
              <EmptyState
                icon={FileText}
                label="견적"
                description="견적을 작성하면 이 고객의 견적 이력이 여기에 쌓입니다"
                ctaHref="/admin/quotes/new"
                ctaLabel="새 견적 작성"
              />
            ) : (
              applications.map((a) => (
                <ActivityRow
                  key={a.id}
                  href={`/admin/applications/${a.id}`}
                  icon={<FileText className="size-4" aria-hidden />}
                  title={a.seq_no}
                  sub={a.company}
                  right={
                    <>
                      <ApplicationStatusBadge status={a.status} />
                      <span className="font-mono text-small tabular-nums text-muted">{dateOnly(a.created_at)}</span>
                    </>
                  }
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="equipment" className="min-h-[300px] pt-2">
            {equipment.length === 0 ? (
              <EmptyState
                icon={Package}
                label="보유장비"
                description="고객이 구입·보유한 장비를 등록하면 A/S 접수와 연결됩니다"
                ctaHref="./edit"
                ctaLabel="보유장비 등록"
              />
            ) : (
              equipment.map((e) => (
                <ActivityRow
                  key={e.id}
                  href={null}
                  icon={<Package className="size-4" aria-hidden />}
                  title={equipmentLabel(e)}
                  sub={e.serial_no ? `S/N ${e.serial_no}` : null}
                  right={
                    <span className="font-mono text-small tabular-nums text-muted">
                      {e.purchased_at ?? "구입일 미입력"}
                    </span>
                  }
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="as" className="min-h-[300px] pt-2">
            {serviceRequests.length === 0 ? (
              <EmptyState
                icon={Wrench}
                label="A/S"
                description="고객 포털에서 접수하거나 대신 접수하면 여기에 표시됩니다"
                ctaHref="/support"
                ctaLabel="새 A/S 접수"
              />
            ) : (
              serviceRequests.map((s) => (
                <ActivityRow
                  key={s.id}
                  href={`/admin/service-requests/${s.id}`}
                  icon={<Wrench className="size-4" aria-hidden />}
                  title={s.seq_no}
                  sub={null}
                  right={
                    <>
                      <StatusBadge status={s.status} />
                      <span className="font-mono text-small tabular-nums text-muted">{dateOnly(s.created_at)}</span>
                    </>
                  }
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="supply" className="min-h-[300px] pt-2">
            {supplyRequests.length === 0 ? (
              <EmptyState
                icon={Box}
                label="소모품"
                description="고객 포털에서 신청하거나 대신 신청하면 여기에 표시됩니다"
                ctaHref="/supply"
                ctaLabel="새 소모품 신청"
              />
            ) : (
              supplyRequests.map((s) => (
                <ActivityRow
                  key={s.id}
                  href={`/admin/supply-requests/${s.id}`}
                  icon={<Box className="size-4" aria-hidden />}
                  title={s.seq_no}
                  sub={
                    s.items[0]
                      ? `${s.items[0].consumable_name_snapshot}${s.item_count > 1 ? ` 외 ${s.item_count - 1}건` : ""}`
                      : null
                  }
                  right={
                    <>
                      <StatusBadge status={s.status} />
                      <span className="font-mono text-small tabular-nums text-muted">{dateOnly(s.created_at)}</span>
                    </>
                  }
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// 탭 라벨 + 건수 pill(활성 탭 pill은 primary 배경).
function TabTriggerWithCount({
  value,
  label,
  count,
  active,
}: {
  value: ActivityTabKey;
  label: string;
  count: number;
  active: ActivityTabKey;
}) {
  const isActive = active === value;
  return (
    <TabsTrigger value={value} className="gap-1.5">
      {label}
      <span
        className={`rounded-full px-1.5 py-px font-mono text-micro font-semibold tabular-nums ${
          isActive ? "bg-accent text-white" : "bg-surface-2 text-muted"
        }`}
      >
        {count}
      </span>
    </TabsTrigger>
  );
}
