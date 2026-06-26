import { RELEASE_OPTIONS, type ReleaseOrderDetails } from "@jhtechsaas/shared";

// 장비출고의뢰서 PDF용 HTML 조립(순수 함수). 종이 양식(목업) 그대로 — 체크박스·프린터/커팅기 2분할·
// 민트 자동채움. Railway(Linux) 크롬엔 시스템폰트가 0이라 NotoSansKR을 @font-face base64로 임베드(필수).

export type ReleaseHtmlData = {
  seqNo: string;
  version: number;
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

const txt = (s: string | null | undefined): string =>
  s && s.trim() ? esc(s) : '<span class="empty">—</span>';

// 체크박스 칩 — on이면 ✓·강조, 아니면 빈 박스.
const chk = (label: string, on: boolean): string =>
  `<span class="chk${on ? " on" : ""}"><span class="box">${on ? "✓" : ""}</span>${esc(label)}</span>`;

// 고정 항목 체크박스 줄(선택값=details 배열). 라벨 + 칩들.
const checksRow = (label: string, options: readonly string[], selected: string[]): string =>
  `<div class="row"><span class="lbl">${esc(label)}</span><span class="checks">${options
    .map((o) => chk(o, selected.includes(o)))
    .join("")}</span></div>`;

// 자유입력 값 줄(라벨 + 값).
const valRow = (label: string, value: string): string =>
  `<div class="row"><span class="lbl">${esc(label)}</span><span class="v">${value}</span></div>`;

// 자동채움 필드(민트 + '자동' 배지).
const autoField = (label: string, value: string, badge: string, full = false): string =>
  `<div class="field auto${full ? " full" : ""}"><div class="k">${esc(label)} <span class="tag">${esc(badge)}</span></div><div class="val">${txt(value)}</div></div>`;

// 준비사항 카드(라벨 + 체크박스). 설문 연동 카드는 auto.
const prepCard = (label: string, options: readonly string[], selected: string[], auto = false): string =>
  `<div class="pcard${auto ? " auto" : ""}"><div class="ph">${esc(label)}${auto ? ' <span class="tag">설문 연동</span>' : ""}</div><div class="checks">${options
    .map((o) => chk(o, selected.includes(o)))
    .join("")}</div></div>`;

function printerPanel(d: ReleaseOrderDetails, active: boolean): string {
  const p = d.printer ?? { rip: "", ripOther: "", headType: "", headCount: "", colors: [], colorsOther: "", inkType: "", inkQty: "" };
  // RIP '기타' 선택 시 직접입력값 줄 추가. 칼라 직접입력값은 있으면 줄 추가.
  const ripOtherRow = p.rip === "기타" && p.ripOther?.trim() ? valRow("제공 RIP(기타)", esc(p.ripOther)) : "";
  const colorsOtherRow = p.colorsOther?.trim() ? valRow("칼라 직접입력", esc(p.colorsOther)) : "";
  return `
    <div class="panel${active ? " active" : " inactive"}">
      <div class="panel-h"><span>프린터</span>${active ? '<span class="chk on"><span class="box">✓</span>선택됨</span>' : '<span class="chk"><span class="box"></span>미선택</span>'}</div>
      <div class="panel-b">
        ${checksRow("제공 RIP", RELEASE_OPTIONS.printerRip, p.rip ? [p.rip] : [])}
        ${ripOtherRow}
        ${valRow("헤드종류·수량", `${txt(p.headType)}${p.headCount ? " / " + esc(p.headCount) : ""}`)}
        ${checksRow("칼라 구성", RELEASE_OPTIONS.printerColors, p.colors)}
        ${colorsOtherRow}
        ${valRow("잉크 종류", txt(p.inkType))}
        ${valRow("잉크 제공수량", txt(p.inkQty))}
      </div>
    </div>`;
}

function cutterPanel(d: ReleaseOrderDetails, active: boolean): string {
  const c = d.cutter ?? { tools: [], camera: [], extras: [] };
  return `
    <div class="panel${active ? " active" : " inactive"}">
      <div class="panel-h"><span>커팅기</span>${active ? '<span class="chk on"><span class="box">✓</span>선택됨</span>' : '<span class="chk"><span class="box"></span>미선택</span>'}</div>
      <div class="panel-b">
        ${checksRow("제공 툴", RELEASE_OPTIONS.cutterTools, c.tools)}
        ${checksRow("카메라", RELEASE_OPTIONS.cutterCamera, c.camera)}
        ${checksRow("기타", RELEASE_OPTIONS.cutterExtras, c.extras)}
      </div>
    </div>`;
}

export function renderReleaseHtml(d: ReleaseHtmlData): string {
  const isPrinter = d.deviceKind === "printer";
  const common = d.details.common;
  const prep = d.details.prep;
  const s = d.details.site;

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
  @font-face{ font-family:'KR'; src:url(${d.fontDataUri}); font-weight:400 700; }
  :root{ --pine:#176455; --mint:#d9f3e9; --mint-soft:#f0f7f4; --border:#dbe5e1; --muted:#5b6f69; --text:#1a2a25; }
  *{ box-sizing:border-box; margin:0; padding:0; }
  html,body{ font-family:'KR',sans-serif; color:var(--text); }
  .page{ width:210mm; padding:10mm 12mm; }
  .topbar{ background:var(--pine); color:#fff; padding:12px 18px; border-radius:10px; display:flex; align-items:center; justify-content:space-between; }
  .topbar h1{ font-size:19px; letter-spacing:.5px; }
  .topbar .meta{ font-size:11px; color:#cde7dd; text-align:right; line-height:1.5; }
  .section{ margin-top:13px; }
  .sec-head{ display:flex; align-items:center; gap:7px; margin-bottom:7px; }
  .sec-head .bar{ width:4px; height:15px; background:var(--pine); border-radius:2px; }
  .sec-head h2{ font-size:13px; font-weight:700; }
  .sec-head .tag{ margin-left:4px; }
  .legend{ font-size:10px; color:var(--muted); margin-bottom:6px; }
  .legend .sw{ display:inline-block; width:11px; height:11px; border-radius:3px; background:var(--mint-soft); border:1px solid #bfe3d4; vertical-align:middle; margin-right:3px; }
  .tag{ font-size:9px; font-weight:700; color:var(--pine); background:var(--mint); border-radius:4px; padding:1px 5px; }
  .grid3{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:7px 12px; }
  .field{ border:1px solid var(--border); border-radius:7px; padding:6px 9px; }
  .memo{ border:1px solid var(--border); border-radius:7px; padding:8px 10px; font-size:11px; line-height:1.5; white-space:pre-wrap; word-break:break-word; }
  .field.auto{ background:var(--mint-soft); border-color:#bfe3d4; }
  .field .k{ font-size:10px; color:var(--muted); }
  .field .val{ font-size:12px; margin-top:2px; }
  .full{ grid-column:1 / -1; }
  .split{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .panel{ border:1px solid var(--border); border-radius:9px; overflow:hidden; }
  .panel.active{ border-color:var(--pine); box-shadow:0 0 0 1px var(--pine); }
  .panel.inactive{ opacity:.55; }
  .panel-h{ display:flex; align-items:center; justify-content:space-between; padding:7px 11px; background:var(--mint-soft); font-weight:700; font-size:12px; }
  .panel.inactive .panel-h{ background:#f3f5f4; color:#9aa8a3; }
  .panel-b{ padding:9px 11px; display:flex; flex-direction:column; gap:7px; }
  .row{ display:grid; grid-template-columns:78px 1fr; gap:7px; align-items:start; font-size:11px; }
  .row .lbl{ color:var(--muted); padding-top:2px; }
  .checks{ display:flex; flex-wrap:wrap; gap:4px 9px; }
  .chk{ display:inline-flex; align-items:center; gap:4px; font-size:11px; }
  .chk .box{ width:13px; height:13px; border:1.3px solid #b6c4be; border-radius:3px; display:inline-flex; align-items:center; justify-content:center; font-size:9px; color:#fff; }
  .chk.on .box{ background:var(--pine); border-color:var(--pine); }
  .chk.on{ font-weight:600; }
  .common{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:7px 12px; margin-top:9px; }
  .grid2{ display:grid; grid-template-columns:1fr 1fr; gap:7px 12px; }
  .pcard{ border:1px solid var(--border); border-radius:9px; padding:9px 11px; }
  .pcard.auto{ background:var(--mint-soft); border-color:#bfe3d4; }
  .pcard .ph{ font-size:11px; font-weight:700; margin-bottom:6px; }
  .empty{ color:#c8d8d2; }
  .toggle-field .v .chk{ font-size:11px; }
  </style></head><body><div class="page">

  <div class="topbar">
    <h1>장비출고의뢰서</h1>
    <div class="meta">출고번호 ${esc(d.seqNo)} (V${d.version})<br>${esc(d.company)} · 발행일 ${esc(d.issuedDateLabel)}</div>
  </div>

  <div class="section">
    <div class="sec-head"><span class="bar"></span><h2>고객정보</h2></div>
    <div class="legend"><span class="sw"></span>연한 민트 = 견적·신청에서 자동으로 채워진 항목</div>
    <div class="grid3">
      ${autoField("회사/고객명", d.company, "자동")}
      ${autoField("장비명", d.deviceName, "자동")}
      ${autoField("전화번호", d.contactPhone, "자동")}
      ${autoField("설치 일시", d.installAtLabel, "견적 납품일정")}
      ${autoField("설치 주소", d.installAddress, "자동", true)}
    </div>
  </div>

  <div class="section">
    <div class="sec-head"><span class="bar"></span><h2>장비상세정보</h2><span class="tag">${isPrinter ? "프린터" : "커팅기"} (구분 자동판별)</span></div>
    <div class="split">
      ${printerPanel(d.details, isPrinter)}
      ${cutterPanel(d.details, !isPrinter)}
    </div>
    <div class="common">
      <div class="field"><div class="k">테스트용 소재</div><div class="val">${txt(common.testMaterial)}</div></div>
      <div class="field"><div class="k">기타 제공물품</div><div class="val">${txt(common.otherSupplies)}</div></div>
      <div class="field"><div class="k">컴퓨터 관련</div><div class="val">${chk("업체 사전준비 요청", common.computerPrep)}</div></div>
    </div>
    <div class="checks" style="margin-top:8px">
      ${chk("도비 사용", common.dobi)}${chk("장비 분해", common.disassemble)}
    </div>
  </div>

  <div class="section">
    <div class="sec-head"><span class="bar"></span><h2>기본 준비사항 체크</h2></div>
    <div class="grid2">
      ${prepCard("운송차량", RELEASE_OPTIONS.transport, prep.transport)}
      ${prepCard("전기 관련 사전준비", RELEASE_OPTIONS.electrical, prep.electrical, true)}
      ${prepCard("입고 관련 준비물", RELEASE_OPTIONS.inboundItems, prep.inboundItems)}
      ${prepCard("기타 준비물", RELEASE_OPTIONS.otherPrep, prep.otherPrep)}
    </div>
  </div>

  <div class="section">
    <div class="sec-head"><span class="bar"></span><h2>설치 현장정보</h2><span class="tag">설치설문 자동 초안</span></div>
    <div class="grid2">
      <div class="field auto full"><div class="k">장비 입고계획 <span class="tag">설문</span></div><div class="val">${txt(s.inboundPlan)}</div></div>
      <div class="field"><div class="k">출입문</div><div class="val">${txt(s.doorType)}${s.doorSize ? " · 크기 " + esc(s.doorSize) : ""}</div></div>
      <div class="field auto"><div class="k">전원 연결 <span class="tag">설문</span></div><div class="val">${txt(s.power)}</div></div>
      <div class="field auto"><div class="k">주차 <span class="tag">설문</span></div><div class="val">${txt(s.parking)}</div></div>
      <div class="field toggle-field"><div class="k">링블로워</div><div class="val">${chk(s.blower.install ? "설치" : "미설치", s.blower.install)}${s.blower.note ? " " + esc(s.blower.note) : ""}</div></div>
      <div class="field toggle-field"><div class="k">컴프레서</div><div class="val">${chk(s.compressor.install ? "설치" : "미설치", s.compressor.install)}${s.compressor.note ? " " + esc(s.compressor.note) : ""}</div></div>
    </div>
  </div>

  ${
    d.details.memo?.trim()
      ? `<div class="section">
    <div class="sec-head"><span class="bar"></span><h2>메모/특이사항</h2></div>
    <div class="memo">${esc(d.details.memo).replace(/\n/g, "<br>")}</div>
  </div>`
      : ""
  }

  </div></body></html>`;
}
