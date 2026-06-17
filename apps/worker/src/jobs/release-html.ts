import type { ReleaseOrderDetails } from "@jhtechsaas/shared";

// 장비출고의뢰서 PDF용 HTML 조립(순수 함수). 폼 4섹션을 A4 인쇄형 문서로.
// Railway(Linux) 크롬엔 시스템폰트가 0이라 NotoSansKR을 @font-face base64로 임베드(필수).

export type ReleaseHtmlData = {
  seqNo: string;
  company: string;
  deviceName: string;
  contactPhone: string;
  installAddress: string;
  installAtLabel: string;
  issuedDateLabel: string;
  deviceKind: "printer" | "cutter";
  details: ReleaseOrderDetails;
  fontDataUri: string;
};

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

// 값 표시(빈 값은 흐린 '—').
const val = (s: string | null | undefined): string =>
  s && s.trim() ? esc(s) : '<span class="empty">—</span>';

// 문자열 배열 → 쉼표 표시(없으면 '—').
const list = (arr: string[] | undefined): string =>
  arr && arr.length ? esc(arr.join(", ")) : '<span class="empty">—</span>';

const yn = (b: boolean): string => (b ? "예" : "아니오");

// 라벨/값 한 줄.
const row = (label: string, value: string): string =>
  `<div class="row"><span class="lbl">${esc(label)}</span><span class="v">${value}</span></div>`;

function printerBlock(d: ReleaseOrderDetails): string {
  const p = d.printer;
  if (!p) return "";
  return `
    <div class="card">
      <div class="card-h">프린터</div>
      ${row("제공 RIP", val(p.rip))}
      ${row("헤드 종류", val(p.headType))}
      ${row("헤드 수량", val(p.headCount))}
      ${row("칼라 구성", list(p.colors))}
      ${row("잉크 종류", val(p.inkType))}
      ${row("잉크 제공수량", val(p.inkQty))}
    </div>`;
}

function cutterBlock(d: ReleaseOrderDetails): string {
  const c = d.cutter;
  if (!c) return "";
  return `
    <div class="card">
      <div class="card-h">커팅기</div>
      ${row("제공 툴", list(c.tools))}
      ${row("카메라", list(c.camera))}
      ${row("기타", list(c.extras))}
    </div>`;
}

export function renderReleaseHtml(d: ReleaseHtmlData): string {
  const s = d.details.site;
  const prep = d.details.prep;
  const common = d.details.common;
  const deviceBlock = d.deviceKind === "printer" ? printerBlock(d.details) : cutterBlock(d.details);

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
  @font-face{ font-family:'KR'; src:url(${d.fontDataUri}); font-weight:400 700; }
  *{ box-sizing:border-box; margin:0; padding:0; }
  html,body{ font-family:'KR',sans-serif; color:#1a2a25; }
  .page{ width:210mm; min-height:297mm; padding:11mm 13mm 11mm; }
  .topbar{ background:#176455; color:#fff; padding:12px 18px; border-radius:10px; display:flex; align-items:center; justify-content:space-between; }
  .topbar h1{ font-size:19px; letter-spacing:.5px; }
  .topbar .meta{ font-size:11px; color:#cde7dd; text-align:right; line-height:1.5; }
  .section{ margin-top:13px; }
  .sec-head{ display:flex; align-items:center; gap:8px; margin-bottom:8px; }
  .sec-head .bar{ width:4px; height:15px; background:#176455; border-radius:2px; }
  .sec-head h2{ font-size:13px; font-weight:700; }
  .grid2{ display:grid; grid-template-columns:1fr 1fr; gap:6px 18px; }
  .field{ border:1px solid #dbe5e1; border-radius:7px; padding:7px 10px; }
  .field.auto{ background:#f0f7f4; border-color:#bfe3d4; }
  .field .k{ font-size:10px; color:#5b6f69; }
  .field .val{ font-size:13px; margin-top:2px; }
  .full{ grid-column:1 / -1; }
  .split{ display:grid; grid-template-columns:1fr; gap:10px; }
  .card{ border:1px solid #dbe5e1; border-radius:9px; overflow:hidden; }
  .card-h{ background:#f0f7f4; padding:7px 12px; font-weight:700; font-size:12px; }
  .row{ display:grid; grid-template-columns:120px 1fr; gap:8px; padding:5px 12px; font-size:12px; border-top:1px solid #eef3f1; }
  .row:first-of-type{ border-top:none; }
  .row .lbl{ color:#5b6f69; }
  .empty{ color:#c8d8d2; }
  .common{ display:grid; grid-template-columns:1fr 1fr; gap:6px 18px; margin-top:8px; }
  .tag{ font-size:9px; font-weight:700; color:#176455; background:#d9f3e9; border-radius:4px; padding:1px 5px; }
  </style></head><body><div class="page">

  <div class="topbar">
    <h1>장비출고의뢰서</h1>
    <div class="meta">출고번호 ${esc(d.seqNo)}<br>${esc(d.company)} · 발행일 ${esc(d.issuedDateLabel)}</div>
  </div>

  <div class="section">
    <div class="sec-head"><span class="bar"></span><h2>고객정보</h2></div>
    <div class="grid2">
      <div class="field auto"><div class="k">회사/고객명</div><div class="val">${val(d.company)}</div></div>
      <div class="field auto"><div class="k">장비명</div><div class="val">${val(d.deviceName)}</div></div>
      <div class="field auto"><div class="k">전화번호</div><div class="val">${val(d.contactPhone)}</div></div>
      <div class="field auto"><div class="k">설치 일시</div><div class="val">${val(d.installAtLabel)}</div></div>
      <div class="field auto full"><div class="k">설치 주소</div><div class="val">${val(d.installAddress)}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="sec-head"><span class="bar"></span><h2>장비상세정보</h2><span class="tag">${d.deviceKind === "printer" ? "프린터" : "커팅기"}</span></div>
    <div class="split">${deviceBlock}</div>
    <div class="common">
      <div class="field"><div class="k">테스트용 소재</div><div class="val">${val(common.testMaterial)}</div></div>
      <div class="field"><div class="k">기타 제공물품</div><div class="val">${val(common.otherSupplies)}</div></div>
      <div class="field"><div class="k">컴퓨터 업체 사전준비</div><div class="val">${yn(common.computerPrep)}</div></div>
      <div class="field"><div class="k">도비 사용 / 장비 분해</div><div class="val">${yn(common.dobi)} / ${yn(common.disassemble)}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="sec-head"><span class="bar"></span><h2>기본 준비사항</h2></div>
    <div class="card">
      ${row("운송차량", list(prep.transport))}
      ${row("전기 사전준비", list(prep.electrical))}
      ${row("입고 준비물", list(prep.inboundItems))}
      ${row("기타 준비물", list(prep.otherPrep))}
    </div>
  </div>

  <div class="section">
    <div class="sec-head"><span class="bar"></span><h2>설치 현장정보</h2></div>
    <div class="card">
      ${row("장비 입고계획", val(s.inboundPlan))}
      ${row("출입문", `${val(s.doorType)}${s.doorSize ? " / 크기 " + esc(s.doorSize) : ""}`)}
      ${row("전원 연결", val(s.power))}
      ${row("주차", val(s.parking))}
      ${row("링블로워", `${s.blower.install ? "설치" : "미설치"}${s.blower.note ? " · " + esc(s.blower.note) : ""}`)}
      ${row("컴프레서", `${s.compressor.install ? "설치" : "미설치"}${s.compressor.note ? " · " + esc(s.compressor.note) : ""}`)}
    </div>
  </div>

  </div></body></html>`;
}
