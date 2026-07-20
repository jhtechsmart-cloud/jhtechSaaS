// 서비스 리포트 PDF용 HTML 조립(순수 함수) — 목업 V4 #reportSheet 7섹션 이식(#228 Part 2).
// 팔레트는 DESIGN.md 파인 그린 토큰. Railway(Linux) 크롬엔 시스템폰트가 0이라
// NotoSansKR @font-face base64 임베드 필수. 서명은 data URI로 인라인.
// 사진은 PDF 미포함(현장 요청 — A4 1장 유지가 우선, 사진은 화면·스토리지에만).
import type { ServicePart } from "@jhtechsaas/shared";

export type ServiceReportHtmlData = {
  seqNo: string;
  issuedAtLabel: string; // 확정 일시(KST)
  engineerName: string;
  engineerTitle: string; // 없으면 빈 문자열
  // 1. 고객
  customerName: string;
  customerBizNo: string; // 하이픈 포맷 or 빈
  customerTel: string;
  customerAddr: string;
  // 2. 장비
  deviceName: string;
  deviceSerial: string;
  purchasedAtLabel: string; // YYYY-MM-DD or 빈
  warrantyLabel: string; // "보증기간 내 (구매 후 n개월)" 등, 판정불가면 빈
  history: { dateLabel: string; summary: string }[]; // 같은 장비 과거 issued 리포트(최근순)
  // 3~5
  faults: string[];
  diagnosis: string;
  actionText: string;
  followLabel: string; // "조치 완료 · 후속 일정 없음" 또는 "후속 조치 필요 — ..."
  // 6. 청구
  parts: ServicePart[];
  visitFee: number;
  overtimeFee: number;
  partsTotal: number;
  vat: number;
  total: number;
  isFree: boolean;
  freeReason: string;
  // 7. 서명
  signatureDataUri: string; // 고객 서명 PNG data URI
  fontDataUri: string;
};

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

const txt = (s: string | null | undefined): string =>
  s && s.trim() ? esc(s) : '<span class="empty">—</span>';

const won = (n: number): string => n.toLocaleString("ko-KR");

export function renderServiceReportHtml(d: ServiceReportHtmlData): string {
  const histRows = d.history.length
    ? `<table class="grid hist">${d.history
        .map((h) => `<tr><th>${esc(h.dateLabel)}</th><td>${esc(h.summary)}</td></tr>`)
        .join("")}</table>`
    : `<p class="none-note">기존 A/S 이력 없음</p>`;

  const partRows = d.parts.length
    ? d.parts
        .map(
          (p) =>
            `<tr><td>${esc(p.name)}</td><td class="n">${p.qty}</td><td class="n">${won(p.price)}</td><td class="n">${won(p.qty * p.price)}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="none-cell">교체 부품 없음</td></tr>`;

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
  @font-face{ font-family:'KR'; src:url(${d.fontDataUri}); font-weight:400 700; }
  :root{ --pine:#176455; --pine-deep:#0F4439; --muted:#5b6f69; --text:#1a2a25; --line:#c9d5d0; --soft:#eef5f2; }
  *{ box-sizing:border-box; margin:0; padding:0; }
  html,body{ font-family:'KR',sans-serif; color:#111; font-size:11px; line-height:1.45; }
  .page{ width:210mm; padding:8mm 10mm; }
  .rs-head{ display:flex; justify-content:space-between; align-items:flex-end; border-bottom:3px solid var(--pine); padding-bottom:7px; }
  .rs-head h1{ font-size:21px; letter-spacing:.5px; color:var(--pine); }
  .rs-head .co{ text-align:right; font-size:11.5px; color:#333; line-height:1.5; }
  .rs-head .co b{ font-size:14px; color:var(--pine); }
  .rs-meta{ display:flex; justify-content:space-between; font-size:10.5px; color:#555; margin:6px 0 4px; }
  .rs-meta b{ font-family:'KR'; font-variant-numeric:tabular-nums; }
  section{ break-inside:avoid; }
  h2{ font-size:11.5px; background:var(--pine); color:#fff; padding:3px 8px; margin:7px 0 5px; border-radius:3px; }
  table{ width:100%; border-collapse:collapse; font-size:11px; }
  table.grid th, table.grid td{ border:1px solid var(--line); padding:3px 7px; text-align:left; vertical-align:top; }
  table.grid th{ background:var(--soft); font-weight:700; width:96px; white-space:nowrap; color:#243b34; }
  table.hist{ margin-top:6px; }
  table.hist th{ width:90px; font-variant-numeric:tabular-nums; }
  .fault-tags span{ display:inline-block; border:1px solid var(--pine); color:var(--pine); border-radius:999px; padding:2px 10px; font-size:11px; margin:2px 4px 2px 0; }
  .longtext{ white-space:pre-wrap; min-height:20px; word-break:break-word; }
  .none-note{ color:#666; font-size:11px; margin-top:4px; }
  .none-cell{ color:#666; }
  .empty{ color:#c8d8d2; }
  table.money th, table.money td{ border:1px solid var(--line); padding:3px 7px; }
  table.money th{ background:var(--soft); text-align:left; }
  table.money td.n, table.money th.n{ text-align:right; font-variant-numeric:tabular-nums; }
  tr.tot td{ font-weight:800; background:#f6f2df; }
  .free-stamp{ color:var(--pine); font-weight:800; border:2px solid var(--pine); border-radius:6px; display:inline-block; padding:2px 12px; transform:rotate(-3deg); }
  .sign-note{ font-size:11.5px; margin-bottom:6px; }
  .sign-row{ display:flex; gap:16px; margin-top:6px; }
  .sign-cell{ flex:1; border:1px solid var(--line); border-radius:6px; padding:7px 12px; min-height:62px; }
  .sign-cell .t{ font-size:10.5px; color:#555; margin-bottom:4px; }
  .sign-cell img{ max-height:44px; }
  .sign-cell .eng-name{ font-size:15px; font-weight:700; color:var(--pine-deep); margin-top:12px; }
  .rs-foot{ margin-top:8px; border-top:1px solid var(--line); padding-top:6px; font-size:10px; color:#666; display:flex; justify-content:space-between; }
  </style></head><body><div class="page">

  <div class="rs-head">
    <h1>SERVICE REPORT</h1>
    <div class="co"><b>(주)재현테크</b><br>JaeHyun Tech Co., Ltd.<br>TEL 02-839-7723</div>
  </div>
  <div class="rs-meta">
    <span>리포트 번호: <b>${esc(d.seqNo)}</b></span>
    <span>확정 일시: ${esc(d.issuedAtLabel)}</span>
    <span>엔지니어: ${esc(d.engineerName)}${d.engineerTitle ? " " + esc(d.engineerTitle) : ""}</span>
  </div>

  <section>
  <h2>1. 고객 정보</h2>
  <table class="grid">
    <tr><th>고객명</th><td>${txt(d.customerName)}</td><th>사업자번호</th><td>${txt(d.customerBizNo)}</td></tr>
    <tr><th>연락처</th><td>${txt(d.customerTel)}</td><th>주소</th><td>${txt(d.customerAddr)}</td></tr>
  </table>
  </section>

  <section>
  <h2>2. 장비 정보</h2>
  <table class="grid">
    <tr><th>장비명</th><td>${txt(d.deviceName)}</td><th>일련번호</th><td>${txt(d.deviceSerial)}</td></tr>
    <tr><th>구매(설치)일</th><td>${txt(d.purchasedAtLabel)}</td><th>보증 상태</th><td>${txt(d.warrantyLabel)}</td></tr>
  </table>
  ${histRows}
  </section>

  <section>
  <h2>3. 점검 및 고장 내역</h2>
  <div class="fault-tags">${d.faults.map((f) => `<span>${esc(f)}</span>`).join("")}</div>
  <table class="grid" style="margin-top:6px"><tr><td class="longtext">${esc(d.diagnosis)}</td></tr></table>
  </section>

  <section>
  <h2>4. 조치 및 수리 내역</h2>
  <table class="grid"><tr><td class="longtext">${esc(d.actionText)}</td></tr></table>
  </section>

  <section>
  <h2>5. 향후 일정</h2>
  <table class="grid"><tr><td>${esc(d.followLabel)}</td></tr></table>
  </section>

  <section>
  <h2>6. 사용 부품 및 청구 내역</h2>
  <table class="money">
    <tr><th>부품명</th><th class="n" style="width:56px">수량</th><th class="n" style="width:104px">단가</th><th class="n" style="width:116px">금액</th></tr>
    ${partRows}
    <tr><th colspan="3">출장비</th><td class="n">${won(d.visitFee)}</td></tr>
    <tr><th colspan="3">시간외 출장비</th><td class="n">${won(d.overtimeFee)}</td></tr>
    <tr><th colspan="3">부품비 합계</th><td class="n">${won(d.partsTotal)}</td></tr>
    <tr><th colspan="3">부가세 (V.A.T 10%)</th><td class="n">${won(d.vat)}</td></tr>
    <tr class="tot"><td colspan="3">총 계 (Total Amount)</td><td class="n">${won(d.total)}원</td></tr>
  </table>
  ${d.isFree ? `<p style="margin-top:8px"><span class="free-stamp">무상 처리</span> <span style="font-size:11px;color:#555;margin-left:8px">사유: ${esc(d.freeReason)}</span></p>` : ""}
  </section>

  <section>
  <h2>7. 고객 확인</h2>
  <p class="sign-note">상기 내용과 같이 장비를 점검·수리하였으며, 청구 금액을 확인합니다.</p>
  <div class="sign-row">
    <div class="sign-cell"><div class="t">고객 확인 [Client] — ${esc(d.customerName)}</div>${d.signatureDataUri ? `<img src="${d.signatureDataUri}" alt="고객 서명">` : ""}</div>
    <div class="sign-cell"><div class="t">엔지니어 [Engineer]</div><div class="eng-name">${esc(d.engineerName)}${d.engineerTitle ? ` <span style="font-size:12px;font-weight:400;color:#555">${esc(d.engineerTitle)}</span>` : ""}</div></div>
  </div>
  <div class="rs-foot"><span>본 리포트는 고객 전자 서명 시점(${esc(d.issuedAtLabel)})에 확정되었으며 이후 수정할 수 없습니다.</span><span>${esc(d.seqNo)}</span></div>
  </section>

  </div></body></html>`;
}
