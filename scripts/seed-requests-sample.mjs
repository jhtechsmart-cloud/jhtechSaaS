// A/S 7건 + 소모품 8건 샘플 시드 — 레이아웃 확인용(로컬 supabase service_role REST).
// 상태·담당·미열람을 골고루 분포시켜 KPI 카드·배지·필터를 한 화면에서 검증할 수 있게 한다.
const URL = "http://127.0.0.1:54321/rest/v1";
const KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

async function rest(path, init = {}) {
  const res = await fetch(`${URL}/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// 고객 4곳(소모품은 등록고객 전용)
const companies = [
  { id: "33333333-3333-4333-8333-333333333301", name: "대덕피앤피", biz_no: "1111111111" },
  { id: "33333333-3333-4333-8333-333333333302", name: "한빛기획", biz_no: "2222222222" },
  { id: "33333333-3333-4333-8333-333333333303", name: "제일사인", biz_no: "3333333333" },
  { id: "33333333-3333-4333-8333-333333333304", name: "신성광고산업", biz_no: "4444444444" },
];
for (const c of companies) {
  await rest("companies", { method: "POST", body: JSON.stringify(c) }).catch((e) => {
    if (!String(e).includes("409") && !String(e).includes("duplicate")) throw e;
  });
}

// 담당자(영업) id — sales 시드 계정
const profiles = await rest("profiles?select=id,name");
const sales = profiles.find((p) => p.name?.includes("영업")) ?? profiles[0];

// 소모품 카탈로그 3종
const consumables = [];
for (const name of [
  ["UV 잉크 시안 1L", "병"],
  ["프린트 헤드 와이퍼", "개"],
  ["LED 램프 모듈", "개"],
]) {
  const [row] = await rest("consumables", {
    method: "POST",
    body: JSON.stringify({ name: name[0], unit: name[1], status: "active" }),
  });
  consumables.push(row);
}

const PRIVACY = {
  privacy_consent: true,
  privacy_consent_at: "2026-06-10T09:00:00+09:00",
  privacy_consent_version: "v1",
};

// ── A/S 7건: 상태 분포 접수3·진행2·보류1·완료1, 일부 미확인(company_id null)·일부 배정 ──
const svcRows = [
  { co: companies[0], symptom: "UV 램프 점등 불량 — 출력물 경화가 안 됩니다", status: "received", assignee: null, read: false },
  { co: companies[1], symptom: "헤드 노즐 막힘, 시안 줄빠짐 발생", status: "received", assignee: null, read: false },
  { co: null, name: "미래애드컴", biz: "5555555555", symptom: "전원 인가 후 부팅 멈춤", status: "received", assignee: null, read: false },
  { co: companies[2], symptom: "X축 이송 소음·진동 점검 요청", status: "in_progress", assignee: sales.id, read: true },
  { co: companies[3], symptom: "잉크 공급 라인 누유", status: "in_progress", assignee: sales.id, read: true },
  { co: companies[0], symptom: "펌웨어 업데이트 후 인식 오류 — 부품 수급 대기", status: "on_hold", assignee: sales.id, read: true },
  { co: companies[1], symptom: "정기 점검(분기) 완료 건", status: "done", assignee: sales.id, read: true },
];
for (const r of svcRows) {
  const [row] = await rest("service_requests", {
    method: "POST",
    body: JSON.stringify({
      biz_no: r.co ? r.co.biz_no : r.biz,
      company_id: r.co ? r.co.id : null,
      contact_company: r.co ? r.co.name : r.name,
      contact_phone: "010-1234-5678",
      status: "received", // 종결잠금 트리거 회피 — 먼저 received로 만들고 아래서 전이
      fields: { symptom: r.symptom },
      ...PRIVACY,
    }),
  });
  const patch = {};
  if (r.status !== "received") patch.status = r.status;
  if (r.assignee) patch.assignee_id = r.assignee;
  if (r.read) patch.admin_read_at = "2026-06-12T10:00:00+09:00";
  if (Object.keys(patch).length) {
    await rest(`service_requests?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify(patch) });
  }
}
console.log("A/S 7건 시드 완료");

// ── 소모품 8건: 상태 분포 접수3·진행2·보류1·완료1·취소1, 품목 1~3개 ──
const supRows = [
  { co: companies[0], requester: "김철수", items: [[0, 2]], status: "received", assignee: null, read: false },
  { co: companies[1], requester: "이영희", items: [[0, 1], [1, 4]], status: "received", assignee: null, read: false },
  { co: companies[2], requester: "박민준", items: [[2, 1]], status: "received", assignee: null, read: false },
  { co: companies[3], requester: "최지우", items: [[0, 3], [1, 2], [2, 1]], status: "in_progress", assignee: sales.id, read: true },
  { co: companies[0], requester: "김철수", items: [[1, 10]], status: "in_progress", assignee: sales.id, read: true },
  { co: companies[1], requester: "정수민", items: [[2, 2]], status: "on_hold", assignee: sales.id, read: true },
  { co: companies[2], requester: "박민준", items: [[0, 1]], status: "done", assignee: sales.id, read: true },
  { co: companies[3], requester: "최지우", items: [[1, 1]], status: "canceled", assignee: null, read: true },
];
for (const r of supRows) {
  const [row] = await rest("supply_requests", {
    method: "POST",
    body: JSON.stringify({
      company_id: r.co.id,
      requester_name: r.requester,
      requester_phone: "010-9876-5432",
      status: "received",
      ...PRIVACY,
    }),
  });
  for (const [ci, qty] of r.items) {
    await rest("supply_request_items", {
      method: "POST",
      body: JSON.stringify({
        request_id: row.id,
        consumable_id: consumables[ci].id,
        consumable_name_snapshot: consumables[ci].name,
        consumable_unit_snapshot: consumables[ci].unit,
        qty,
      }),
    });
  }
  const patch = {};
  if (r.status !== "received") patch.status = r.status;
  if (r.assignee) patch.assignee_id = r.assignee;
  if (r.read) patch.admin_read_at = "2026-06-12T10:00:00+09:00";
  if (Object.keys(patch).length) {
    await rest(`supply_requests?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify(patch) });
  }
}
console.log("소모품 8건 시드 완료");
