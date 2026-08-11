// 홈페이지 '전체 제품' 카드용 대표 이미지 합성(500×500) — 수제 카드 프레임 재현.
// 실측(3300s.jpg): 좌측 세로 밴드 53px 네이비 #1a2842(영문 카테고리, 세로쓰기),
// 상단 밴드 95px 차콜 #23282c(제품명 굵게 + 부제 회색), 본문 흰 배경 중앙 제품 사진,
// 우하단 브랜드/모델 로고(선택). 폰트는 워커 번들 NotoSansKR(합성 볼드).
export interface WpCardInput {
  /** 상단 밴드 큰 제목(모델명 권장) */
  title: string;
  /** 상단 밴드 부제(장비명·분류명) */
  subtitle: string | null;
  /** 좌측 세로 밴드 영문 대문자 텍스트(비면 밴드는 무지 네이비) */
  sideText: string | null;
  /** 본문 중앙 제품 사진 data URI */
  photoDataUri: string;
  /** 우하단 로고 data URI(선택 — 견적서 모델명 로고 재사용) */
  logoDataUri: string | null;
  /** 한글 폰트 data URI(워커 번들 NotoSansKR) */
  fontDataUri: string;
  /** 영문 볼드 이탤릭 폰트 data URI(워커 번들 Arimo Bold Italic — 좌측 밴드, 수제 카드 서체) */
  latinFontDataUri: string;
}

export const WP_CARD_SIZE = 500;

// 카드 PNG 합성 — 워커 Puppeteer(견적 PDF와 동일 브라우저 매니저) 재사용.
// 페이지만 열고 닫는다(브라우저 수명은 매니저 소관 — quote-pdf 패턴 동일).
export async function composeCardPng(input: WpCardInput): Promise<Uint8Array> {
  const { getBrowser } = await import("./browser");
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: WP_CARD_SIZE, height: WP_CARD_SIZE });
    await page.setContent(renderWpCardHtml(input), { waitUntil: "load" });
    return await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: WP_CARD_SIZE, height: WP_CARD_SIZE },
    });
  } finally {
    await page.close();
  }
}

export function renderWpCardHtml(input: WpCardInput): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @font-face { font-family: 'KR'; src: url('${input.fontDataUri}'); }
  @font-face { font-family: 'EN'; src: url('${input.latinFontDataUri}'); font-weight: bold; font-style: italic; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: ${WP_CARD_SIZE}px; height: ${WP_CARD_SIZE}px; font-family: 'KR', sans-serif; background: #fff; }
  .card { position: relative; width: ${WP_CARD_SIZE}px; height: ${WP_CARD_SIZE}px; background: #fff; overflow: hidden; }
  .side { position: absolute; left: 0; top: 0; width: 53px; height: 100%; background: #1a2842;
          display: flex; align-items: flex-start; justify-content: center; }
  /* 세로 영문: 원본은 위→아래로 읽힘(vertical-rl 기본, rotate 없음) + 합성 900으로 더 두껍게 */
  .side span { writing-mode: vertical-rl; color: #fff;
               font-family: 'EN', 'KR', sans-serif; font-style: italic; font-weight: 900;
               font-size: 28px; letter-spacing: 1px; white-space: nowrap; padding-top: 10px; }
  .top { position: absolute; left: 53px; top: 0; right: 0; height: 95px; background: #23282c;
         padding: 14px 0 0 18px; border-bottom: 1px solid #3a3f44; }
  .top .title { color: #fff; font-weight: 900; font-size: 29px; line-height: 1.2;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .top .subtitle { color: #c3c9ce; font-weight: 800; font-size: 20px; margin-top: 4px;
                   white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .content { position: absolute; left: 53px; top: 95px; right: 0; bottom: 0;
             display: flex; align-items: center; justify-content: center; padding: 18px; }
  .content img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .logo { position: absolute; right: 12px; bottom: 10px; max-height: 42px; max-width: 150px; }
</style></head><body>
<div class="card">
  <div class="side">${input.sideText ? `<span>${esc(input.sideText.toUpperCase())}</span>` : ""}</div>
  <div class="top">
    <div class="title">${esc(input.title)}</div>
    ${input.subtitle ? `<div class="subtitle">${esc(input.subtitle)}</div>` : ""}
  </div>
  <div class="content"><img src="${input.photoDataUri}" alt=""></div>
  ${input.logoDataUri ? `<img class="logo" src="${input.logoDataUri}" alt="">` : ""}
</div>
</body></html>`;
}
