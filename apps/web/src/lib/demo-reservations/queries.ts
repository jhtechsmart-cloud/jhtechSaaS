// 데모예약 조회 — RLS(조회 전 직원)에 맡기고 서버에서 KST 원자값으로 변환해 내려준다.
// time_range는 gist 인덱스를 타는 overlaps(&&) 필터로만 조회(스캔 회피).

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addDaysKst, kstDateOf, kstHmOf } from "@/lib/format/kst";
import { durationMinOf, parseTstzRange } from "./range";

export interface DemoReservationRow {
  id: string;
  companyId: string | null;
  customerName: string;
  equipmentName: string;
  visitorName: string | null;
  visitorPhone: string | null;
  memo: string | null;
  status: "confirmed" | "done";
  date: string; // KST "YYYY-MM-DD"
  start: string; // KST "HH:mm"
  end: string; // KST "HH:mm"
  durationMin: number;
  createdByName: string | null; // profiles RLS상 admin 외 null 가능
}

/** KST 하루 범위의 tstzrange 리터럴(반개구간). */
function dayRangeLiteral(dateKst: string): string {
  return `[${dateKst}T00:00:00+09:00,${addDaysKst(dateKst, 1)}T00:00:00+09:00)`;
}

function mapRow(r: Record<string, unknown>): DemoReservationRow | null {
  const range = parseTstzRange((r.time_range as string) ?? "");
  if (!range) return null;
  const date = kstDateOf(range.startIso);
  const start = kstHmOf(range.startIso);
  const end = kstHmOf(range.endIso);
  if (!date || !start || !end) return null;
  const equipment = r.equipment as { name?: string } | null;
  const profile = r.profiles as { name?: string } | null;
  return {
    id: r.id as string,
    companyId: (r.company_id as string | null) ?? null,
    customerName: r.customer_name as string,
    equipmentName: equipment?.name ?? "-",
    visitorName: (r.visitor_name as string | null) ?? null,
    visitorPhone: (r.visitor_phone as string | null) ?? null,
    memo: (r.memo as string | null) ?? null,
    status: r.status as "confirmed" | "done",
    date,
    start,
    end,
    durationMin: durationMinOf(range.startIso, range.endIso),
    createdByName: profile?.name ?? null,
  };
}

const SELECT_COLS =
  "id,company_id,customer_name,visitor_name,visitor_phone,memo,status,time_range,equipment:equipment_id(name),profiles:created_by(name)";

/** 선택일(KST)의 예약 목록 — 취소 제외, 시작시각 오름차순. */
export async function listReservationsForDate(
  dateKst: string,
): Promise<DemoReservationRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("demo_reservations")
    .select(SELECT_COLS)
    .overlaps("time_range", dayRangeLiteral(dateKst))
    .neq("status", "canceled")
    .order("time_range", { ascending: true });
  if (error) {
    console.error("[demo_reservations.listForDate]", error);
    return [];
  }
  return (data ?? [])
    .map((r) => mapRow(r as Record<string, unknown>))
    .filter((r): r is DemoReservationRow => r != null);
}

/** 선택 월(KST)의 예약 목록 — 취소 제외, 시작시각 오름차순. 캘린더 아래 "이번 달 예약" 리스트용. */
export async function listReservationsForMonth(
  year: number,
  month: number,
): Promise<DemoReservationRow[]> {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextFirst =
    month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("demo_reservations")
    .select(SELECT_COLS)
    .overlaps("time_range", `[${first}T00:00:00+09:00,${nextFirst}T00:00:00+09:00)`)
    .neq("status", "canceled")
    .order("time_range", { ascending: true });
  if (error) {
    console.error("[demo_reservations.listForMonth]", error);
    return [];
  }
  return (data ?? [])
    .map((r) => mapRow(r as Record<string, unknown>))
    .filter((r): r is DemoReservationRow => r != null);
}

/** 월 캘린더 dot — 해당 월(KST)의 데모 예약일·납품일 집합. */
export async function listDotDaysForMonth(
  year: number,
  month: number,
): Promise<{ demo: string[]; delivery: string[] }> {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextFirst =
    month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const supabase = await createSupabaseServerClient();

  const [demoRes, deliveryRes] = await Promise.all([
    supabase
      .from("demo_reservations")
      .select("time_range")
      .overlaps("time_range", `[${first}T00:00:00+09:00,${nextFirst}T00:00:00+09:00)`)
      .neq("status", "canceled"),
    supabase
      .from("quotes")
      .select("delivery_date")
      .gte("delivery_date", first)
      .lt("delivery_date", nextFirst),
  ]);

  const demo = new Set<string>();
  if (demoRes.error) console.error("[demo_reservations.dots]", demoRes.error);
  for (const r of demoRes.data ?? []) {
    const range = parseTstzRange((r as { time_range: string }).time_range);
    const d = range ? kstDateOf(range.startIso) : null;
    if (d) demo.add(d);
  }

  const delivery = new Set<string>();
  if (deliveryRes.error) console.error("[quotes.deliveryDots]", deliveryRes.error);
  for (const r of deliveryRes.data ?? []) {
    const d = (r as { delivery_date: string | null }).delivery_date;
    if (d) delivery.add(d);
  }
  return { demo: [...demo], delivery: [...delivery] };
}

export interface EquipmentOptionRow {
  id: string;
  name: string;
  model: string | null;
  category_id: string | null; // 대분류 분류용(프린터/커팅기 — Phase 2 체크박스 그리드)
}

/** 데모 장비 선택용 — active + is_demo 카탈로그(이름순). */
export async function listActiveEquipmentOptions(): Promise<EquipmentOptionRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("equipment")
    .select("id,name,model,category_id")
    .eq("status", "active")
    .eq("is_demo", true)
    .order("name", { ascending: true });
  if (error) {
    console.error("[demo_reservations.equipmentOptions]", error);
    return [];
  }
  return (data ?? []) as EquipmentOptionRow[];
}

export interface UpcomingScheduleRow {
  kind: "demo" | "delivery";
  id: string;
  title: string; // 데모: 고객명 · 장비명 / 납품: 회사명 · 견적번호
  date: string; // KST "YYYY-MM-DD"
  start: string | null; // "HH:mm" (납품 시간 미정이면 null)
  end: string | null; // 데모만 종료 시각
  href: string;
}

/** 다가오는 데모·납품 일정 — 오늘(KST)부터, 시각 오름차순 limit건. 대시보드 일정 레일 공용. */
export async function listUpcomingSchedules(
  todayKstDate: string,
  limit = 5,
): Promise<UpcomingScheduleRow[]> {
  const supabase = await createSupabaseServerClient();
  const [demoRes, deliveryRes] = await Promise.all([
    supabase
      .from("demo_reservations")
      .select("id,customer_name,time_range,equipment:equipment_id(name)")
      .overlaps("time_range", `[${todayKstDate}T00:00:00+09:00,infinity)`)
      .neq("status", "canceled")
      .order("time_range", { ascending: true })
      .limit(limit),
    supabase
      .from("quotes")
      .select("id,quote_no,delivery_date,delivery_time,applications:application_id(id,company)")
      .gte("delivery_date", todayKstDate)
      .order("delivery_date", { ascending: true })
      .limit(limit),
  ]);

  const rows: UpcomingScheduleRow[] = [];
  if (demoRes.error) console.error("[demo_reservations.upcoming]", demoRes.error);
  for (const raw of demoRes.data ?? []) {
    const r = raw as Record<string, unknown>;
    const range = parseTstzRange((r.time_range as string) ?? "");
    if (!range) continue;
    const date = kstDateOf(range.startIso);
    if (!date) continue;
    const equipment = r.equipment as { name?: string } | null;
    rows.push({
      kind: "demo",
      id: r.id as string,
      title: `${r.customer_name as string} · ${equipment?.name ?? "장비"} 데모`,
      date,
      start: kstHmOf(range.startIso),
      end: kstHmOf(range.endIso),
      href: `/admin/demo-reservations?date=${date}`,
    });
  }
  if (deliveryRes.error) console.error("[quotes.upcomingDelivery]", deliveryRes.error);
  for (const raw of deliveryRes.data ?? []) {
    const r = raw as Record<string, unknown>;
    const date = r.delivery_date as string | null;
    if (!date) continue;
    const app = r.applications as { id?: string; company?: string } | null;
    const time = (r.delivery_time as string | null)?.slice(0, 5) ?? null;
    rows.push({
      kind: "delivery",
      id: r.id as string,
      title: `${app?.company ?? "고객"} 납품`,
      date,
      start: time,
      end: null,
      href: app?.id ? `/admin/applications/${app.id}?v=${r.id as string}` : "/admin/applications",
    });
  }

  rows.sort((a, b) =>
    `${a.date}T${a.start ?? "99:99"}`.localeCompare(`${b.date}T${b.start ?? "99:99"}`),
  );
  return rows.slice(0, limit);
}
