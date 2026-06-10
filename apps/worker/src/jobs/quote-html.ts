import { SUPPLIER } from "@jhtechsaas/shared";

export type QuoteHtmlItem = { name: string; qtyLabel: string; unitPrice: number; amount: number };
export type QuoteHtmlIncluded = { name: string; qtyLabel: string };
export type QuoteHtmlSpecGroup = { group: string; items: { label: string; value: string }[] };

export type QuoteHtmlData = {
  quoteNo: string;
  issuedDateLabel: string;
  assigneeName: string;
  assigneePhone: string | null;
  recipient: string;
  supplyPrice: number;
  koreanAmount: string;
  items: QuoteHtmlItem[];
  includedOptions: QuoteHtmlIncluded[];
  extraOptions: QuoteHtmlItem[];
  specGroups: QuoteHtmlSpecGroup[];
  notes: string[];
  bannerTopDataUri: string | null;
  bannerBottomDataUri: string | null;
  stampDataUri: string;
  fontDataUri: string;
};

const won = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function renderQuoteHtml(d: QuoteHtmlData): string {
  const itemRows = d.items
    .map(
      (it) => `<tr class="main"><td class="name"><b>${esc(it.name)}</b></td><td>${esc(it.qtyLabel)}</td><td class="num">${won(it.unitPrice)}</td><td class="num">${won(it.amount)}</td><td></td></tr>`,
    )
    .join("");
  const incRows = d.includedOptions
    .map((o) => `<tr class="sub"><td class="name"> - ${esc(o.name)}</td><td>${esc(o.qtyLabel)}</td><td class="num">포함</td><td class="num">포함</td><td></td></tr>`)
    .join("");
  const extraRows = d.extraOptions
    .map((o) => `<tr class="sub"><td class="name"> - ${esc(o.name)}</td><td>${esc(o.qtyLabel)}</td><td class="num">${won(o.unitPrice)}</td><td class="num">${won(o.amount)}</td><td></td></tr>`)
    .join("");
  const specs = d.specGroups.length
    ? `<div class="band">장비사양 (Specification)</div><div class="specs">${d.specGroups
        .map((g) => `<div class="spec-group"><div class="spec-title">${esc(g.group)}</div>${g.items.map((i) => `<div class="spec-item">· ${esc(i.label)} : ${esc(i.value)}</div>`).join("")}</div>`)
        .join("")}</div>`
    : "";
  const notes = d.notes.map((n, i) => `<div class="note">${i + 1}. ${esc(n)}</div>`).join("");

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
@font-face{font-family:'KR';src:url("${d.fontDataUri}");}
@page{size:A4;margin:0;}
*{box-sizing:border-box;margin:0;padding:0;font-family:'KR',sans-serif;}
/* A4 높이로 채우고 세로 플렉스 → 가운데(.pad)가 늘어나 하단 배너를 항상 페이지 바닥에 고정. */
body{width:210mm;min-height:296mm;color:#111;font-size:11px;display:flex;flex-direction:column;}
.banner{width:100%;display:block;}
.pad{padding:0 14mm;flex:1 1 auto;}
.head{display:flex;justify-content:space-between;margin-top:8px;}
.meta div{line-height:1.7;}
.supplier{border:1px solid #333;font-size:10px;position:relative;min-width:88mm;}
.supplier .title{background:#eee;text-align:center;letter-spacing:6px;border-bottom:1px solid #333;}
.supplier table{width:100%;border-collapse:collapse;}
.supplier td{border:1px solid #999;padding:2px 5px;}
.stamp{position:absolute;right:8px;top:18px;width:54px;opacity:.95;}
.recipient{font-size:20px;font-weight:700;border-bottom:2px solid #111;display:inline-block;margin:14px 0 6px;padding-bottom:2px;}
.recipient .suffix{font-size:13px;font-weight:500;margin-left:8px;}
.lead{margin:6px 0;}
.sumband{display:flex;align-items:center;gap:12px;margin:6px 0;}
.sumband .lbl{background:#3a4a5a;color:#fff;font-weight:700;letter-spacing:4px;padding:6px 14px;}
.sumband .amt{font-size:15px;font-weight:700;}
table.items{width:100%;border-collapse:collapse;margin-top:4px;}
table.items th,table.items td{border:1px solid #333;padding:4px 6px;text-align:center;}
table.items th{background:#f3f3f3;}
table.items td.name{text-align:left;}
table.items td.num{text-align:right;font-variant-numeric:tabular-nums;}
table.items tr.total td{font-weight:700;}
.band{background:#3a4a5a;color:#fff;text-align:center;letter-spacing:6px;padding:5px;margin-top:12px;}
.specs{display:grid;grid-template-columns:1fr 1fr;gap:2px 18px;padding:8px 2px;}
.spec-title{font-weight:700;margin-top:4px;}
.note{margin:2px 0;color:#333;}
</style></head><body>
${d.bannerTopDataUri ? `<img class="banner" src="${d.bannerTopDataUri}">` : ""}
<div class="pad">
  <div class="head">
    <div class="meta">
      <div>견 적 일 자 : ${esc(d.issuedDateLabel)}</div>
      <div>견 적 번 호 : ${esc(d.quoteNo)}</div>
      <div>담 당 자 명 : ${esc(d.assigneeName)}</div>
      ${d.assigneePhone ? `<div>　　　　　　　${esc(d.assigneePhone)}</div>` : ""}
    </div>
    <div class="supplier">
      <div class="title">공 급 자</div>
      <img class="stamp" src="${d.stampDataUri}">
      <table>
        <tr><td>등록번호</td><td colspan="3">${SUPPLIER.bizNo}</td></tr>
        <tr><td>상 호</td><td>${SUPPLIER.name}</td><td>성 명</td><td>${SUPPLIER.ceo}</td></tr>
        <tr><td>주 소</td><td colspan="3">${SUPPLIER.address}<br>서울본사 ${SUPPLIER.phoneHQ} / 대구지사 ${SUPPLIER.phoneDaegu}</td></tr>
        <tr><td>업 태</td><td>${SUPPLIER.bizType}</td><td>종 목</td><td>${SUPPLIER.bizItem}</td></tr>
      </table>
    </div>
  </div>
  <div><span class="recipient">${esc(d.recipient)}<span class="suffix">귀하</span></span></div>
  <div class="lead">아래와 같이 견적합니다.</div>
  <div class="sumband"><span class="lbl">합 계 금 액</span><span class="amt">일금 ${esc(d.koreanAmount)}원정(VAT별도) ( ${won(d.supplyPrice)}- )</span><span>(단위 : 원)</span></div>
  <table class="items">
    <thead><tr><th>품목코드 및 품목명</th><th>수 량</th><th>단 가</th><th>공급가액</th><th>비 고</th></tr></thead>
    <tbody>${itemRows}${incRows}${extraRows}
      <tr class="total"><td colspan="3">총　　계</td><td class="num">${won(d.supplyPrice)}</td><td></td></tr>
    </tbody>
  </table>
  ${specs}
  <div class="band">특 기 사 항</div>
  ${notes}
</div>
${d.bannerBottomDataUri ? `<img class="banner" src="${d.bannerBottomDataUri}">` : ""}
</body></html>`;
}
