import "server-only";
// 대시보드 v2 집계 — 전부 호출자 RLS 통과 쿼리(역할별 가시 범위 자동 적용 = 영업은 본인 스코프).
// 페이지가 Promise.allSettled로 병렬 실행, 개별 실패는 null로 흡수(기존 패턴).

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { kstDateOf, kstHmOf } from "@/lib/format/kst";
import { parseTstzRange, durationMinOf } from "@/lib/demo-reservations/range";
import type { CalendarEvent } from "./v2-logic";

/** 진행 중 견적 — 종결 전 의뢰 건수 + 각 의뢰 최신 견적 합계 금액. */
export async function inProgressQuotes(): Promise<{ count: number; totalSum: number }> {
  const supabase = await createSupabaseServerClient();
  const { data: apps, error } = await supabase
    .from("applications")
    .select("id")
    .in("status", ["assigned", "quoted", "quote_sent"]);
  if (error) throw error;
  const ids = (apps ?? []).map((a: { id: string }) => a.id);
  if (ids.length === 0) return { count: 0, totalSum: 0 };

  const { data: quotes, error: qErr } = await supabase
    .from("quotes")
    .select("application_id, version, total")
    .in("application_id", ids);
  if (qErr) throw qErr;

  // 의뢰별 최신 버전 견적만 합산(재발행 시 구버전 중복 합산 방지)
  const latest = new Map<string, { version: number; total: number }>();
  for (const q of (quotes ?? []) as Array<{ application_id: string; version: number; total: string }>) {
    const cur = latest.get(q.application_id);
    if (!cur || q.version > cur.version) {
      latest.set(q.application_id, { version: q.version, total: Number(q.total) });
    }
  }
  let totalSum = 0;
  for (const v of latest.values()) totalSum += v.total;
  return { count: ids.length, totalSum };
}

/** 이번 주(월~일 KST) 데모·납품 — 건수 + 데모 예약시간 합(분). */
export async function weekDemoDelivery(
  weekStart: string,
  weekEnd: string,
): Promise<{ demoCount: number; demoMinutes: number; deliveryCount: number }> {
  const supabase = await createSupabaseServerClient();
  const [demoRes, delRes] = await Promise.all([
    supabase
      .from("demo_reservations")
      .select("time_range")
      .overlaps("time_range", `[${weekStart}T00:00:00+09:00,${weekEnd}T00:00:00+09:00)`)
      .neq("status", "canceled"),
    supabase
      .from("quotes")
      .select("id", { count: "exact", head: true })
      .gte("delivery_date", weekStart)
      .lt("delivery_date", weekEnd),
  ]);
  if (demoRes.error) throw demoRes.error;
  let demoMinutes = 0;
  for (const r of demoRes.data ?? []) {
    const range = parseTstzRange((r as { time_range: string }).time_range);
    if (range) demoMinutes += durationMinOf(range.startIso, range.endIso);
  }
  return {
    demoCount: (demoRes.data ?? []).length,
    demoMinutes,
    deliveryCount: delRes.count ?? 0,
  };
}

/** 전체 고객 + 이번 달 신규(KST 월초 기준). */
export async function customersWithNewThisMonth(
  monthFirst: string,
): Promise<{ total: number; newThisMonth: number }> {
  const supabase = await createSupabaseServerClient();
  const [totalRes, newRes] = await Promise.all([
    supabase.from("companies").select("id", { count: "exact", head: true }),
    supabase
      .from("companies")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${monthFirst}T00:00:00+09:00`),
  ]);
  if (totalRes.error) throw totalRes.error;
  return { total: totalRes.count ?? 0, newThisMonth: newRes.count ?? 0 };
}

/** 발송 후 7일 경과 — quote_sent 의뢰 중 최신 발행일이 7일보다 오래된 건수. */
export async function staleQuoteSentCount(nowIso: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data: apps, error } = await supabase
    .from("applications")
    .select("id")
    .eq("status", "quote_sent");
  if (error) throw error;
  const ids = (apps ?? []).map((a: { id: string }) => a.id);
  if (ids.length === 0) return 0;
  const { data: quotes } = await supabase
    .from("quotes")
    .select("application_id, issued_at")
    .in("application_id", ids)
    .not("issued_at", "is", null);
  // 의뢰별 최신 발행일
  const latest = new Map<string, string>();
  for (const q of (quotes ?? []) as Array<{ application_id: string; issued_at: string }>) {
    const cur = latest.get(q.application_id);
    if (!cur || q.issued_at > cur) latest.set(q.application_id, q.issued_at);
  }
  const cutoff = new Date(new Date(nowIso).getTime() - 7 * 86400_000).toISOString();
  let stale = 0;
  for (const issuedAt of latest.values()) if (issuedAt < cutoff) stale += 1;
  return stale;
}

/**
 * 2주 캘린더 이벤트 union — 5종(견적 발행·A/S 접수·소모품 신청·데모·납품)을 병렬 조회.
 * [fromKst, toKst) 반개구간.
 */
export async function listCalendarEvents(
  fromKst: string,
  toKst: string,
): Promise<CalendarEvent[]> {
  const supabase = await createSupabaseServerClient();
  const fromIso = `${fromKst}T00:00:00+09:00`;
  const toIso = `${toKst}T00:00:00+09:00`;

  const [quotesRes, svcRes, supRes, demoRes, delRes] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, application_id, issued_at, applications:application_id(company)")
      .gte("issued_at", fromIso)
      .lt("issued_at", toIso),
    supabase
      .from("service_requests")
      .select("id, contact_company, created_at")
      .gte("created_at", fromIso)
      .lt("created_at", toIso),
    supabase
      .from("supply_requests")
      .select("id, created_at, companies:company_id(name)")
      .gte("created_at", fromIso)
      .lt("created_at", toIso),
    supabase
      .from("demo_reservations")
      .select("id, customer_name, time_range, equipment:equipment_id(name)")
      .overlaps("time_range", `[${fromIso},${toIso})`)
      .neq("status", "canceled"),
    supabase
      .from("quotes")
      .select("id, application_id, delivery_date, delivery_time, applications:application_id(company)")
      .gte("delivery_date", fromKst)
      .lt("delivery_date", toKst),
  ]);

  const events: CalendarEvent[] = [];

  for (const raw of quotesRes.data ?? []) {
    const r = raw as Record<string, unknown>;
    const date = r.issued_at ? kstDateOf(r.issued_at as string) : null;
    if (!date) continue;
    const app = r.applications as { company?: string } | null;
    events.push({
      type: "quote",
      id: r.id as string,
      title: `${app?.company ?? "견적"} 견적 발행`,
      date,
      hm: kstHmOf(r.issued_at as string),
      href: `/admin/applications/${r.application_id as string}?v=${r.id as string}`,
    });
  }
  for (const raw of svcRes.data ?? []) {
    const r = raw as Record<string, unknown>;
    const date = kstDateOf(r.created_at as string);
    if (!date) continue;
    events.push({
      type: "service",
      id: r.id as string,
      title: `${(r.contact_company as string) ?? "A/S"} A/S 접수`,
      date,
      hm: kstHmOf(r.created_at as string),
      href: `/admin/service-requests/${r.id as string}`,
    });
  }
  for (const raw of supRes.data ?? []) {
    const r = raw as Record<string, unknown>;
    const date = kstDateOf(r.created_at as string);
    if (!date) continue;
    const co = r.companies as { name?: string } | null;
    events.push({
      type: "supply",
      id: r.id as string,
      title: `${co?.name ?? "소모품"} 소모품 신청`,
      date,
      hm: kstHmOf(r.created_at as string),
      href: `/admin/supply-requests/${r.id as string}`,
    });
  }
  for (const raw of demoRes.data ?? []) {
    const r = raw as Record<string, unknown>;
    const range = parseTstzRange((r.time_range as string) ?? "");
    const date = range ? kstDateOf(range.startIso) : null;
    if (!range || !date) continue;
    const eq = r.equipment as { name?: string } | null;
    events.push({
      type: "demo",
      id: r.id as string,
      title: `${r.customer_name as string} ${eq?.name ?? "장비"} 데모`,
      date,
      hm: kstHmOf(range.startIso),
      href: `/admin/demo-reservations?date=${date}`,
    });
  }
  for (const raw of delRes.data ?? []) {
    const r = raw as Record<string, unknown>;
    const date = r.delivery_date as string | null;
    if (!date) continue;
    const app = r.applications as { company?: string } | null;
    events.push({
      type: "delivery",
      id: `delivery-${r.id as string}`,
      title: `${app?.company ?? "고객"} 납품`,
      date,
      hm: (r.delivery_time as string | null)?.slice(0, 5) ?? null,
      href: `/admin/applications/${r.application_id as string}?v=${r.id as string}`,
    });
  }

  return events;
}
