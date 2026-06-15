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
  quoteBgDataUri: string;            // 고정 A4 배경
  companyLogoDataUri: string;        // 고정 회사 로고(좌상단)
  deviceImageDataUri: string | null; // 장비별 우하단 이미지
  deviceNameDataUri: string | null;  // 장비별 좌하단 네임
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
/* 배경 이미지를 페이지 전체에 깔고, 본문은 그 위 레이어. A4 높이 채워 하단 장비 영역을 바닥 고정. */
body{position:relative;width:210mm;min-height:296mm;color:#111;font-size:13px;
  background-image:url("${d.quoteBgDataUri}");background-size:cover;background-position:center;
  display:flex;flex-direction:column;}
.logo{width:46mm;margin:10mm 0 2mm 14mm;display:block;}
.pad{padding:0 14mm;flex:1 1 auto;}
.head{display:flex;justify-content:space-between;gap:16px;margin-top:2mm;align-items:stretch;}
.head-left{display:flex;flex-direction:column;flex:1;min-width:0;}
.meta div{line-height:1.7;}
.meta .ml{display:inline-block;width:74px;}
.recipient-row{margin-top:auto;padding-top:10px;padding-bottom:3px;text-align:right;border-bottom:2.5px solid #111;}
.recipient{font-size:24px;font-weight:700;}
.rsuffix{font-size:16px;font-weight:500;margin-left:6px;}
.supplier{position:relative;width:54%;font-size:12px;}
.supplier table{width:100%;border-collapse:collapse;background:rgba(255,255,255,.85);}
.supplier td{border:1px solid #888;padding:3px 7px;word-break:keep-all;}
.supplier td.k{white-space:nowrap;background:#f4f4f4;font-weight:500;text-align:center;}
.supplier td.title{text-align:center;letter-spacing:6px;background:#ececec;font-weight:600;}
.stamp{position:absolute;right:6px;top:26px;width:66px;opacity:.95;z-index:2;}
.lead{margin:8px 0;}
.sumband{display:flex;align-items:stretch;margin:8px 0;}
.sumband .lbl{width:200px;display:flex;align-items:center;justify-content:center;background:#3a4a5a;color:#fff;font-weight:700;letter-spacing:4px;padding:8px 16px;}
.sumband .amt-bg{flex:1;display:flex;align-items:center;background:#ececec;padding:0 16px;}
.sumband .amt{margin-left:auto;font-size:18px;font-weight:700;}
.sumband .unit{margin-left:18px;font-size:12px;font-weight:700;color:#555;}
table.items{width:100%;border-collapse:collapse;margin-top:4px;background:rgba(255,255,255,.85);}
table.items th,table.items td{border:1px solid #333;padding:4px 6px;text-align:center;}
table.items th{background:#f3f3f3;}
table.items td.name{text-align:left;}
table.items td.num{text-align:right;font-variant-numeric:tabular-nums;}
table.items tr.total td{font-weight:700;}
.band{background:#3a4a5a;color:#fff;text-align:center;letter-spacing:6px;padding:5px;margin-top:12px;}
.specs{display:grid;grid-template-columns:1fr 1fr;gap:2px 18px;padding:8px 2px;}
.spec-title{font-weight:700;margin-top:4px;}
.note{margin:2px 0;color:#333;}
/* 하단 좌우 장비 영역 — 배경 조명 위. 좌=네임, 우=이미지. */
.device{display:flex;justify-content:space-between;align-items:flex-end;padding:0 14mm 12mm;gap:10mm;}
.device .name-img{width:64mm;max-height:34mm;object-fit:contain;}
.device .dev-img{width:88mm;max-height:50mm;object-fit:contain;}
</style></head><body>
<img class="logo" src="${d.companyLogoDataUri}">
<div class="pad">
  <div class="head">
    <div class="head-left">
      <div class="meta">
        <div><span class="ml">견 적 일 자 :</span>${esc(d.issuedDateLabel)}</div>
        <div><span class="ml">견 적 번 호 :</span>${esc(d.quoteNo)}</div>
        <div><span class="ml">담 당 자 명 :</span>${esc(d.assigneeName)}</div>
        ${d.assigneePhone ? `<div><span class="ml"></span>${esc(d.assigneePhone)}</div>` : ""}
      </div>
      <div class="recipient-row"><span class="recipient">${esc(d.recipient)}</span><span class="rsuffix">귀하</span></div>
    </div>
    <div class="supplier">
      <img class="stamp" src="${d.stampDataUri}">
      <table>
        <tr><td class="title" colspan="4">공 급 자</td></tr>
        <tr><td class="k">등록번호</td><td colspan="3">${SUPPLIER.bizNo}</td></tr>
        <tr><td class="k">상 호</td><td>${SUPPLIER.name}</td><td class="k">성 명</td><td>${SUPPLIER.ceo}</td></tr>
        <tr><td class="k">주 소</td><td colspan="3">${SUPPLIER.address}<br>서울본사 ${SUPPLIER.phoneHQ} / 대구지사 ${SUPPLIER.phoneDaegu}</td></tr>
        <tr><td class="k">업 태</td><td>${SUPPLIER.bizType}</td><td class="k">종 목</td><td>${SUPPLIER.bizItem}</td></tr>
      </table>
    </div>
  </div>
  <div class="lead">아래와 같이 견적합니다.</div>
  <div class="sumband"><span class="lbl">합 계 금 액</span><div class="amt-bg"><span class="amt">일금 ${esc(d.koreanAmount)}원정(VAT별도) ( ${won(d.supplyPrice)}- )</span><span class="unit">(단위 : 원)</span></div></div>
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
<div class="device">
  ${d.deviceNameDataUri ? `<img class="name-img" src="${d.deviceNameDataUri}">` : "<span></span>"}
  ${d.deviceImageDataUri ? `<img class="dev-img" src="${d.deviceImageDataUri}">` : "<span></span>"}
</div>
</body></html>`;
}
