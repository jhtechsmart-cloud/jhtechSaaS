import { describe, expect, test } from "vitest";
import { renderWpCardHtml } from "./wp-card-image";

const base = {
  title: "XTRA 3300S",
  subtitle: "대형 롤투롤 UV 프린터",
  sideText: "roll to roll uv printer",
  photoDataUri: "data:image/png;base64,AAA",
  logoDataUri: "data:image/png;base64,BBB",
  fontDataUri: "data:font/otf;base64,CCC",
};

describe("renderWpCardHtml — 전체 제품 카드 프레임(500×500)", () => {
  test("제목·부제·사진·로고·측면 대문자 텍스트가 들어간다", () => {
    const html = renderWpCardHtml(base);
    expect(html).toContain("XTRA 3300S");
    expect(html).toContain("대형 롤투롤 UV 프린터");
    expect(html).toContain("ROLL TO ROLL UV PRINTER"); // 측면 밴드는 대문자 강제
    expect(html).toContain('src="data:image/png;base64,AAA"');
    expect(html).toContain('class="logo" src="data:image/png;base64,BBB"');
    expect(html).toContain("#1a2842"); // 좌측 밴드 네이비(실측값)
    expect(html).toContain("#23282c"); // 상단 밴드 차콜(실측값)
  });

  test("부제·측면·로고가 없으면 해당 요소를 렌더하지 않는다", () => {
    const html = renderWpCardHtml({ ...base, subtitle: null, sideText: null, logoDataUri: null });
    expect(html).not.toContain('class="subtitle"'); // CSS 규칙명은 남고 요소만 미출력
    expect(html).not.toContain('class="logo"');
    expect(html).not.toContain("<span></span>"); // 빈 측면 텍스트 미출력
  });

  test("텍스트는 HTML 이스케이프된다(stored XSS 차단)", () => {
    const html = renderWpCardHtml({ ...base, title: '19" 커터 & <script>x</script>' });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;");
  });
});
