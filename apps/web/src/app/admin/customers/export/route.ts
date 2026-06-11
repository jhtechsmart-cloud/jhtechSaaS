import { requireCustomersEdit } from "@/lib/auth/guard";
import { getCustomers } from "@/lib/customers/queries";
import { customerListParamsSchema } from "@/lib/customers/list-table";

// 고객 목록 CSV 내보내기 — 현재 필터(URL 파라미터) 그대로 적용해 전량 스트림.
// 페이지 파라미터는 무시하고 100건 청크로 순회(상한 5,000건 — 초과 시 잘림 표기).
const MAX_ROWS = 5000;

function csvCell(v: string | number | null): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const access = await requireCustomersEdit();
  if (access.status === "forbidden") return new Response("권한이 없습니다", { status: 403 });

  const url = new URL(req.url);
  const parsed = customerListParamsSchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  const base = parsed.success ? parsed.data : customerListParamsSchema.parse({});

  const header = [
    "업체명", "장부번호", "사업자번호", "대표자", "담당자", "전화", "휴대폰",
    "지역", "담당영업", "견적", "보유장비", "AS", "최근활동",
  ];
  const lines: string[] = [header.join(",")];
  let truncated = false;
  for (let page = 1; lines.length - 1 < MAX_ROWS; page++) {
    const { rows, total } = await getCustomers({ ...base, page, pp: 100, userId: access.userId });
    for (const r of rows) {
      lines.push([
        csvCell(r.name), csvCell(r.ledger_no), csvCell(r.biz_no), csvCell(r.ceo), csvCell(r.manager),
        csvCell(r.phone1 ?? r.phone), csvCell(r.mobile), csvCell(r.region), csvCell(r.assignee_name),
        csvCell(r.quotes_count), csvCell(r.equipment_count), csvCell(r.as_count),
        csvCell(r.activity_at ? r.activity_at.slice(0, 10) : ""),
      ].join(","));
    }
    if (rows.length < 100 || lines.length - 1 >= total) break;
    if (lines.length - 1 >= MAX_ROWS) truncated = true;
  }
  if (truncated) lines.push(`"※ ${MAX_ROWS}건 초과분은 생략되었습니다"`);

  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // BOM — 엑셀 한글 인코딩 인식용
  return new Response("﻿" + lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="customers-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
