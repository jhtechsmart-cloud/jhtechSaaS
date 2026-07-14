import { RELEASE_OPTIONS, type ReleaseOrderDetails } from "@jhtechsaas/shared";

// 장비출고의뢰서 PDF용 HTML 조립(순수 함수). 표(2열) 양식 — 섹션 타이틀은 하단 파인 밑줄,
// 본문은 항목 박스 없이 표로 정렬. 영업담당자는 고객정보 제목 우측에 표기.
// Railway(Linux) 크롬엔 시스템폰트가 0이라 NotoSansKR을 @font-face base64로 임베드(필수).

export type ReleaseHtmlData = {
  seqNo: string;
  version: number;
  company: string;
  deviceName: string;
  contactPhone: string;
  installAddress: string;
  installAtLabel: string;
  assigneeName: string; // 영업담당자(의뢰 배정자, 없으면 빈 문자열)
  issuedDateLabel: string;
  deviceKind: "printer" | "cutter";
  details: ReleaseOrderDetails;
  fontDataUri: string;
};

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

// 값 또는 빈 표시(—). 입력은 이스케이프된 평문.
const txt = (s: string | null | undefined): string =>
  s && s.trim() ? esc(s) : '<span class="empty">—</span>';

// 체크 칩 — on이면 ✓·강조, 아니면 빈 박스.
const chk = (label: string, on: boolean): string =>
  `<span class="chk${on ? " on" : ""}"><span class="box">${on ? "✓" : ""}</span>${esc(label)}</span>`;

// 체크박스 묶음(고정 항목 + 선택값).
const chips = (options: readonly string[], selected: string[]): string =>
  `<span class="chips">${options.map((o) => chk(o, selected.includes(o))).join("")}</span>`;

// 준비사항 박스별 특이사항 — 값 있을 때만 체크칩 아래 한 줄(빈 값이면 기존과 동일 = 1장 여백 보존).
const prepNote = (note: string): string =>
  note?.trim() ? `<div class="prepnote"><b>특이사항</b>${esc(note)}</div>` : "";

// 선택된 장비(프린터/커팅기) 상세 표 행들. 직접입력값은 있을 때만 줄 추가.
function deviceRows(d: ReleaseOrderDetails, isPrinter: boolean): string {
  if (isPrinter) {
    const p = d.printer ?? { rip: "", ripOther: "", headType: "", headCount: "", colors: [], colorsOther: "", inkType: "", inkQty: "" };
    const ripOtherRow =
      p.rip === "기타" && p.ripOther?.trim()
        ? `<tr><th>제공 RIP(기타)</th><td colspan="3">${esc(p.ripOther)}</td></tr>`
        : "";
    const colorsOtherRow = p.colorsOther?.trim()
      ? `<tr><th>칼라 직접입력</th><td colspan="3">${esc(p.colorsOther)}</td></tr>`
      : "";
    return `
      <tr><th>제공 RIP</th><td colspan="3">${chips(RELEASE_OPTIONS.printerRip, p.rip ? [p.rip] : [])}</td></tr>
      ${ripOtherRow}
      <tr><th>헤드 종류</th><td>${txt(p.headType)}</td><th>헤드 수량</th><td>${txt(p.headCount)}</td></tr>
      <tr><th>칼라 구성</th><td colspan="3">${chips(RELEASE_OPTIONS.printerColors, p.colors)}</td></tr>
      ${colorsOtherRow}
      <tr><th>잉크 종류</th><td>${txt(p.inkType)}</td><th>잉크 제공수량</th><td>${txt(p.inkQty)}</td></tr>`;
  }
  const c = d.cutter ?? { tools: [], camera: [], extras: [] };
  return `
      <tr><th>제공 툴</th><td colspan="3">${chips(RELEASE_OPTIONS.cutterTools, c.tools)}</td></tr>
      <tr><th>카메라</th><td colspan="3">${chips(RELEASE_OPTIONS.cutterCamera, c.camera)}</td></tr>
      <tr><th>기타</th><td colspan="3">${chips(RELEASE_OPTIONS.cutterExtras, c.extras)}</td></tr>`;
}

export function renderReleaseHtml(d: ReleaseHtmlData): string {
  const isPrinter = d.deviceKind === "printer";
  const common = d.details.common;
  const prep = d.details.prep;
  const s = d.details.site;
  const doorVal = `${txt(s.doorType)}${s.doorSize?.trim() ? " · 크기 " + esc(s.doorSize) : ""}`;
  const blowerVal = `${chk(s.blower.install ? "설치" : "미설치", s.blower.install)}${s.blower.note?.trim() ? " " + esc(s.blower.note) : ""}`;
  const compVal = `${chk(s.compressor.install ? "설치" : "미설치", s.compressor.install)}${s.compressor.note?.trim() ? " " + esc(s.compressor.note) : ""}`;

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
  @font-face{ font-family:'KR'; src:url(${d.fontDataUri}); font-weight:400 700; }
  :root{ --pine:#176455; --border:#dbe5e1; --muted:#5b6f69; --text:#1a2a25; }
  *{ box-sizing:border-box; margin:0; padding:0; }
  html,body{ font-family:'KR',sans-serif; color:var(--text); }
  .page{ width:210mm; padding:10mm 12mm; }
  .topbar{ background:var(--pine); color:#fff; padding:12px 18px; border-radius:10px; display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
  .topbar h1{ font-size:19px; letter-spacing:.5px; }
  .topbar .meta{ font-size:11px; color:#cde7dd; text-align:right; line-height:1.5; }
  /* 섹션 간격·표 패딩·메모 높이는 특이사항 4줄이 다 채워져도 A4 1장에 들어가도록 압축 조정됨 */
  .section{ margin-top:14px; }
  /* 섹션 타이틀 — 하단 파인 밑줄로 본문과 구분 */
  .sec-head{ display:flex; align-items:center; gap:7px; padding-bottom:6px; margin-bottom:10px; border-bottom:2px solid var(--pine); }
  .sec-head .bar{ width:4px; height:15px; background:var(--pine); border-radius:2px; }
  .sec-head h2{ font-size:13px; font-weight:700; }
  .sec-head .owner{ margin-left:auto; font-size:11px; font-weight:600; color:var(--text); }
  .sec-head .owner b{ color:var(--pine); }
  .subhead{ font-size:11.5px; font-weight:700; color:var(--pine); margin:10px 0 5px; }
  .subhead.off{ color:#9aa8a3; }
  /* 표(2열) — 항목 박스 대신 라벨/값 격자 정렬 */
  table{ width:100%; border-collapse:collapse; }
  th{ text-align:left; width:108px; background:#f4f7f6; color:var(--muted); font-weight:600; font-size:11px; padding:5px 9px; border:1px solid #e7edea; vertical-align:top; }
  td{ font-size:12px; padding:5px 9px; border:1px solid #e7edea; vertical-align:top; }
  .chips{ display:flex; flex-wrap:wrap; gap:4px 12px; }
  .chk{ display:inline-flex; align-items:center; gap:4px; font-size:11px; }
  .chk .box{ width:13px; height:13px; border:1.3px solid #b6c4be; border-radius:3px; display:inline-flex; align-items:center; justify-content:center; font-size:9px; color:#fff; }
  .chk.on .box{ background:var(--pine); border-color:var(--pine); }
  .chk.on{ font-weight:600; }
  .empty{ color:#c8d8d2; }
  /* 메모 — 현장 작성 공간(항상 표시, 빈 칸도 유지) */
  .memo{ border:1px dashed #c3d2cc; border-radius:7px; padding:8px 10px; font-size:11px; line-height:1.6; min-height:60px; white-space:pre-wrap; word-break:break-word; }
  /* 기본 준비사항 — 제목·내용 세로 중앙정렬 + 박스별 특이사항(값 있을 때만 한 줄, 1장 여백 보존) */
  .prep th, .prep td{ vertical-align:middle; }
  .prepnote{ margin-top:3px; padding-top:3px; border-top:1px dashed #dbe5e1; font-size:10.5px; line-height:1.35; word-break:break-word; }
  .prepnote b{ color:var(--pine); font-weight:700; margin-right:4px; }
  </style></head><body><div class="page">

  <div class="topbar">
    <h1>장비출고의뢰서</h1>
    <div class="meta">출고번호 ${esc(d.seqNo)} (V${d.version})<br>${esc(d.company)} · 발행일 ${esc(d.issuedDateLabel)}</div>
  </div>

  <div class="section">
    <div class="sec-head"><span class="bar"></span><h2>고객정보</h2><span class="owner">영업담당자 : <b>${d.assigneeName.trim() ? esc(d.assigneeName) : "미배정"}</b></span></div>
    <table>
      <tr><th>회사/고객명</th><td>${txt(d.company)}</td><th>장비명</th><td>${txt(d.deviceName)}</td></tr>
      <tr><th>전화번호</th><td>${txt(d.contactPhone)}</td><th>설치 일시</th><td>${txt(d.installAtLabel)}</td></tr>
      <tr><th>설치 주소</th><td colspan="3">${txt(d.installAddress)}</td></tr>
    </table>
  </div>

  <div class="section">
    <div class="sec-head"><span class="bar"></span><h2>장비상세정보</h2></div>
    <div class="subhead">${isPrinter ? "프린터" : "커팅기"} · 선택됨</div>
    <table>
      ${deviceRows(d.details, isPrinter)}
      <tr><th>테스트용 소재</th><td>${txt(common.testMaterial)}</td><th>기타 제공물품</th><td>${txt(common.otherSupplies)}</td></tr>
      <tr><th>추가 항목</th><td colspan="3"><span class="chips">${chk("컴퓨터 사전준비 요청", common.computerPrep)}${chk("도비 사용", common.dobi)}${chk("장비 분해", common.disassemble)}</span></td></tr>
    </table>
    <div class="subhead off">${isPrinter ? "커팅기" : "프린터"} · 미선택</div>
  </div>

  <div class="section">
    <div class="sec-head"><span class="bar"></span><h2>기본 준비사항 체크</h2></div>
    <table class="prep">
      <tr><th>운송차량</th><td colspan="3">${chips(RELEASE_OPTIONS.transport, prep.transport)}${prepNote(prep.transportNote)}</td></tr>
      <tr><th>전기 관련 사전준비</th><td colspan="3">${chips(RELEASE_OPTIONS.electrical, prep.electrical)}${prepNote(prep.electricalNote)}</td></tr>
      <tr><th>입고 관련 준비물</th><td colspan="3">${chips(RELEASE_OPTIONS.inboundItems, prep.inboundItems)}${prepNote(prep.inboundNote)}</td></tr>
      <tr><th>기타 준비물</th><td colspan="3">${chips(RELEASE_OPTIONS.otherPrep, prep.otherPrep)}${prepNote(prep.otherPrepNote)}</td></tr>
    </table>
  </div>

  <div class="section">
    <div class="sec-head"><span class="bar"></span><h2>설치 현장정보</h2></div>
    <table>
      <tr><th>장비 입고계획</th><td colspan="3">${txt(s.inboundPlan)}</td></tr>
      <tr><th>출입문</th><td>${doorVal}</td><th>전원 연결</th><td>${txt(s.power)}</td></tr>
      <tr><th>주차</th><td>${txt(s.parking)}</td><th>링블로워</th><td>${blowerVal}</td></tr>
      <tr><th>컴프레서</th><td colspan="3">${compVal}</td></tr>
    </table>
  </div>

  <div class="section">
    <div class="sec-head"><span class="bar"></span><h2>메모 / 특이사항</h2></div>
    <div class="memo">${d.details.memo?.trim() ? esc(d.details.memo).replace(/\n/g, "<br>") : ""}</div>
  </div>

  </div></body></html>`;
}
