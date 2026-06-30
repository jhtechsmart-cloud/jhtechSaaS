import { SUPPLIER } from "@jhtechsaas/shared";

export type QuoteHtmlItem = { name: string; qtyLabel: string; unitPrice: number; amount: number; remark?: string };
export type QuoteHtmlIncluded = { name: string; qtyLabel: string };
export type QuoteHtmlSpecGroup = { group: string; items: { label: string; value: string }[] };

export type QuoteHtmlData = {
  quoteNo: string;
  issuedDateLabel: string;
  assigneeName: string;
  assigneePhone: string | null;
  recipient: string;
  recipientManager: string | null; // 수신처 담당자(연결 고객, 없으면 null)
  recipientTitle: string | null; // 수신처 담당자 직책(없으면 null)
  supplyPrice: number;
  koreanAmount: string;
  items: QuoteHtmlItem[];
  includedOptions: QuoteHtmlIncluded[];
  extraOptions: QuoteHtmlItem[];
  specGroups: QuoteHtmlSpecGroup[];
  notes: string[];
  modelName: string;                 // 상단 헤더 큰 텍스트(장비 모델명 전체)
  modelFontDataUri: string;          // 고정 Arimo Bold Italic(모델명용)
  quoteBgDataUri: string;            // 고정 A4 배경
  topBannerDataUri: string;          // 고정 상단 헤더 배경(회색 띠)
  companyLogoDataUri: string;        // 고정 회사 로고(상단 헤더 좌측)
  deviceImageDataUri: string | null; // 장비별 우하단 이미지
  deviceNameDataUri: string | null;  // 장비별 좌하단 네임
  stampDataUri: string;
  fontDataUri: string;
};

const won = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// 견적 줄(품목·옵션)의 최소 형태.
export type QuoteLineLite = { name: string; unitPrice: number; quantity: number; kind?: "included" | "extra"; equipmentId?: string; remark?: string };

// 품목표 행 구성(순수) — 포함옵션 가격을 같은 장비(equipmentId) 줄에 흡수한다.
//   · 장비 줄 단가 = 기본가 + 포함옵션 합 = 공급가/수량(최종 단가). 공급가 = Σ(기본가+포함옵션)×수량과 일치.
//   · 포함옵션 줄 = 이름만(단가/공급가 빈칸). 추가옵션(구 견적)은 금액 그대로.
//   · equipmentId 없는 구 포함옵션(가격 0)은 첫 장비에 흡수. 같은 equipmentId 중복은 1회만 흡수.
export function buildItemTable(items: QuoteLineLite[], options: QuoteLineLite[]): {
  htmlItems: QuoteHtmlItem[];
  includedOptions: QuoteHtmlIncluded[];
  extraOptions: QuoteHtmlItem[];
} {
  const included = options.filter((o) => o.kind === "included");
  const includedOptions: QuoteHtmlIncluded[] = included.map((o) => ({ name: o.name, qtyLabel: `${o.quantity}ea` }));
  const extraOptions: QuoteHtmlItem[] = options
    .filter((o) => o.kind === "extra")
    .map((o) => ({ name: o.name, qtyLabel: `${o.quantity}ea`, unitPrice: o.unitPrice, amount: o.unitPrice * o.quantity, remark: o.remark }));

  const incByEq = new Map<string, number>();
  let incNoEq = 0;
  for (const o of included) {
    const amt = o.unitPrice * o.quantity;
    if (o.equipmentId) incByEq.set(o.equipmentId, (incByEq.get(o.equipmentId) ?? 0) + amt);
    else incNoEq += amt;
  }
  const usedEq = new Set<string>();
  let leftover = incNoEq;
  const htmlItems: QuoteHtmlItem[] = items.map((it, idx) => {
    let inc = 0;
    if (it.equipmentId && !usedEq.has(it.equipmentId)) {
      inc += incByEq.get(it.equipmentId) ?? 0;
      usedEq.add(it.equipmentId);
    }
    if (idx === 0) {
      inc += leftover;
      leftover = 0;
    }
    const amount = it.unitPrice * it.quantity + inc;
    return {
      name: it.name,
      qtyLabel: it.quantity === 1 ? "1SET" : `${it.quantity}SET`,
      unitPrice: it.quantity ? Math.round(amount / it.quantity) : it.unitPrice,
      amount,
      remark: it.remark,
    };
  });
  return { htmlItems, includedOptions, extraOptions };
}

export function renderQuoteHtml(d: QuoteHtmlData): string {
  const itemRows = d.items
    .map(
      (it) => `<tr class="main"><td class="name"><b>${esc(it.name)}</b></td><td>${esc(it.qtyLabel)}</td><td class="num">${won(it.unitPrice)}</td><td class="num">${won(it.amount)}</td><td class="remark">${esc(it.remark ?? "")}</td></tr>`,
    )
    .join("");
  // 포함옵션 — 품목명만. 단가·공급가는 빈칸(금액은 장비 줄에 합산됨, 0/'포함' 표기 안 함).
  const incRows = d.includedOptions
    .map((o) => `<tr class="sub"><td class="name"> - ${esc(o.name)}</td><td>${esc(o.qtyLabel)}</td><td class="num"></td><td class="num"></td><td></td></tr>`)
    .join("");
  const extraRows = d.extraOptions
    .map((o) => `<tr class="sub"><td class="name"> - ${esc(o.name)}</td><td>${esc(o.qtyLabel)}</td><td class="num">${won(o.unitPrice)}</td><td class="num">${won(o.amount)}</td><td class="remark">${esc(o.remark ?? "")}</td></tr>`)
    .join("");
  // 사양 = 항목 이름(라벨)·값이 모두 있는 항목만(둘 중 하나라도 비면 PDF 미포함). 그룹 제목 미표시.
  // 2단 CSS 다단 흐름(column-count)으로 항목을 위→아래로 채워 자동 균형 → 좌·우 행이 엮이지 않아
  // 항목 사이에 빈 공간이 생기지 않는다(이전 2열 그리드는 한쪽이 길면 반대쪽이 늘어나 여백이 생겼음).
  const specItems = d.specGroups
    .flatMap((g) => g.items)
    .filter((i) => i.label.trim() !== "" && i.value.trim() !== "");
  // 라벨 em폭 근사(한글/CJK=1, 공백=0.33, 그 외=0.6) — 가장 넓은 라벨로 라벨 컬럼 폭 통일(구분선 정렬).
  const labelEmWidth = (s: string): number => {
    let w = 0;
    for (const ch of s) {
      const c = ch.codePointAt(0) ?? 0;
      const cjk = (c >= 0x1100 && c <= 0x11ff) || (c >= 0x3000 && c <= 0x9fff) || (c >= 0xac00 && c <= 0xd7ff) || (c >= 0xff00 && c <= 0xffef);
      w += cjk ? 1 : ch === " " ? 0.33 : 0.6;
    }
    return w;
  };
  const labelEm = specItems.map((i) => labelEmWidth(`- ${i.label}`)).reduce((a, b) => Math.max(a, b), 0);
  const labelW = (labelEm + 0.15).toFixed(2); // +0.15em 버퍼(과대평가 보정 최소화 — 값 폭 확보)
  // 항목 앞 하이픈(-) + 라벨 고정폭(.spec-k) + 항목/값 세로 구분선(.spec-v border-left).
  const specItemsHtml = specItems
    .map((i) => `<div class="spec-item"><span class="spec-k">- ${esc(i.label)}</span><span class="spec-v">${esc(i.value)}</span></div>`)
    .join("");
  const specs = specItems.length
    ? `<div class="band">장비사양 (Specification)</div><div class="specs" style="--label-w:${labelW}em"><div class="spec-list">${specItemsHtml}</div></div>`
    : "";
  const notes = d.notes.map((n, i) => `<div class="note">${i + 1}. ${esc(n)}</div>`).join("");
  // 수신처 담당자·직책 — 연결 고객이 있을 때만(공개폼 의뢰는 둘 다 null → 회사명만). 빈 값은 제외.
  const recipientContact = [d.recipientManager, d.recipientTitle]
    .filter((s): s is string => !!s && s.trim() !== "")
    .map(esc)
    .join(" ");

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
@font-face{font-family:'KR';src:url("${d.fontDataUri}");}
@font-face{font-family:'ModelBI';src:url("${d.modelFontDataUri}");font-weight:bold;font-style:italic;}
@page{size:A4;margin:0;}
*{box-sizing:border-box;margin:0;padding:0;font-family:'KR',sans-serif;}
/* 배경 이미지를 페이지 전체에 깔고, 본문은 그 위 레이어. A4 높이 채워 하단 장비 영역을 바닥 고정. */
body{position:relative;width:210mm;min-height:296mm;color:#111;font-size:13px;
  background-image:url("${d.quoteBgDataUri}");background-size:cover;background-position:center;
  display:flex;flex-direction:column;}
/* 상단 헤더 — 회색 띠 배경(고정) 위에 좌측 로고 + 큰 모델명 텍스트(흰색 이탤릭). */
.top-banner{position:relative;width:100%;height:42mm;
  background-image:url("${d.topBannerDataUri}");background-size:100% 100%;}
.top-banner .logo{position:absolute;top:4mm;left:8mm;height:12mm;}
.top-banner .model{position:absolute;left:8mm;bottom:6mm;right:14mm;
  color:#fff;font-family:'ModelBI','KR',Arial,Helvetica,sans-serif;font-style:italic;font-weight:bold;
  font-size:33px;letter-spacing:.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.pad{padding:4mm 14mm 0;flex:1 1 auto;}
.head{display:flex;justify-content:space-between;gap:16px;margin-top:2mm;align-items:stretch;}
.head-left{display:flex;flex-direction:column;flex:1;min-width:0;}
.meta div{line-height:1.7;}
.meta .ml{display:inline-block;width:74px;}
.recipient-row{margin-top:auto;padding-top:10px;padding-bottom:3px;text-align:right;border-bottom:2.5px solid #111;}
/* 수신처 = 회사명 + (담당자·직책)님 귀하. 담당자·직책이 붙어 길어지므로 회사명도 축소(이전 24px). */
.recipient{font-size:18px;font-weight:700;}
.rcontact{font-size:13px;font-weight:600;margin-left:6px;}
.rsuffix{font-size:13px;font-weight:500;margin-left:6px;}
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
/* 합계 한글금액 — 폰트 축소 + 줄바꿈 금지(긴 금액·(단위:원) 모두 한 줄 유지). min-width:0이라야 nowrap이 amt-bg를 안 넘침. */
.sumband .amt-bg{min-width:0;overflow:hidden;}
.sumband .amt{margin-left:auto;font-size:12px;font-weight:700;white-space:nowrap;}
.sumband .unit{margin-left:18px;font-size:11px;font-weight:700;color:#555;white-space:nowrap;flex:0 0 auto;}
/* 품목표 — 폰트를 특기사항(.note)과 동일 톤으로 축소. */
table.items{width:100%;border-collapse:collapse;margin-top:4px;background:rgba(255,255,255,.85);font-size:11.5px;}
table.items th,table.items td{border:1px solid #333;padding:4px 6px;text-align:center;}
table.items th{background:#f3f3f3;}
table.items td.name{text-align:left;}
table.items td.num{text-align:right;font-variant-numeric:tabular-nums;}
table.items td.remark{text-align:left;white-space:pre-wrap;word-break:break-word;}
table.items tr.total td{font-weight:700;}
.band{background:#3a4a5a;color:#fff;text-align:center;letter-spacing:6px;padding:5px;margin-top:8px;}
/* 사양 — 항목 이름·값만(그룹 제목 없음). 2단 CSS 다단 흐름(위→아래 자동 균형)으로 항목을 채워
   좌·우 행이 엮이지 않아 항목 사이 빈 공간이 안 생긴다. 항목 많아도 1페이지 유지(간격 압축). */
.specs{padding:5px 2px;font-size:11.5px;}
.spec-list{column-count:2;column-gap:18px;}
/* 항목 한 줄 = 라벨(고정폭 --label-w) | 값. break-inside:avoid로 한 항목이 단 사이로 안 쪼개짐. */
.spec-item{display:flex;break-inside:avoid;line-height:1.28;padding:0.5px 0;}
.spec-k{flex:0 0 var(--label-w,7em);color:#5b6b78;white-space:nowrap;padding-right:6px;}
/* 값 — 라벨 우측 고정 위치에서 시작(구분선 정렬). min-width:0이라야 긴 값이 제 칸에서 줄바꿈. */
.spec-v{flex:1 1 auto;min-width:0;color:#1a1a1a;padding-left:7px;border-left:1px solid #e3e9ec;}
.note{margin:2px 0;color:#333;font-size:11.5px;}
/* 하단 좌우 장비 영역 — 배경 조명 위. 좌=네임, 우=이미지. flex:1 .pad가 하단으로 밀어 1페이지 바닥 고정. */
.device{display:flex;justify-content:space-between;align-items:flex-end;padding:0 14mm 10mm;gap:10mm;}
.device .name-img{width:60mm;max-height:30mm;object-fit:contain;}
.device .dev-img{width:84mm;max-height:46mm;object-fit:contain;}
</style></head><body>
<div class="top-banner">
  <img class="logo" src="${d.companyLogoDataUri}">
  <div class="model">${esc(d.modelName)}</div>
</div>
<div class="pad">
  <div class="head">
    <div class="head-left">
      <div class="meta">
        <div><span class="ml">견 적 일 자 :</span>${esc(d.issuedDateLabel)}</div>
        <div><span class="ml">견 적 번 호 :</span>${esc(d.quoteNo)}</div>
        <div><span class="ml">담 당 자 명 :</span>${esc(d.assigneeName)}</div>
        ${d.assigneePhone ? `<div><span class="ml"></span>${esc(d.assigneePhone)}</div>` : ""}
      </div>
      <div class="recipient-row"><span class="recipient">${esc(d.recipient)}</span>${recipientContact ? `<span class="rcontact">${recipientContact}님</span>` : ""}<span class="rsuffix">귀하</span></div>
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
