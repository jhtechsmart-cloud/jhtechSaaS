import { describe, expect, it } from "vitest";
import { renderWpPostHtml, type WpPostEquipment } from "./wp-post-html";

// WP 글 본문 순수 렌더 — 가격·옵션 제외, 사용자 입력 전부 이스케이프,
// 유튜브는 ID 추출 성공분만 nocookie embed, 이미지는 주입된 URL 맵 사용.

function equip(over: Partial<WpPostEquipment> = {}): WpPostEquipment {
  return {
    name: "자동 급지 커팅기",
    model: "MC-1080",
    photos: ["equipment/u1/a.png", "equipment/u1/b.png"],
    highlights: ["듀얼 툴 헤드", "카메라 시스템"],
    specs: [
      {
        group: "규격",
        icon: "ruler",
        items: [
          { id: "s1", label: "재단 폭", value: "1,080mm" },
          { id: "s2", label: "속도", value: "1,200mm/s" },
        ],
      },
    ],
    youtubeUrls: ["https://youtu.be/456ADQ8-8Xo"],
    ...over,
  };
}

const urls = {
  "equipment/u1/a.png": "https://wp.example/wp-content/uploads/a.png",
  "equipment/u1/b.png": "https://wp.example/wp-content/uploads/b.png",
};

describe("renderWpPostHtml", () => {
  it("대표사진·highlights·사양표·유튜브 embed를 모두 렌더한다", () => {
    const html = renderWpPostHtml(equip(), { imageUrls: urls });
    expect(html).toContain("https://wp.example/wp-content/uploads/a.png");
    expect(html).toContain("듀얼 툴 헤드");
    expect(html).toContain("재단 폭");
    expect(html).toContain("1,080mm");
    expect(html).toContain("https://www.youtube-nocookie.com/embed/456ADQ8-8Xo");
  });

  it("URL 맵에 없는 사진은 렌더하지 않는다 (업로드 실패분 미노출)", () => {
    const html = renderWpPostHtml(equip(), {
      imageUrls: { "equipment/u1/a.png": urls["equipment/u1/a.png"] },
    });
    expect(html).not.toContain("b.png");
  });

  it("사진 0장·highlights 없음·사양 없음·영상 없음이면 해당 섹션 자체가 없다", () => {
    const html = renderWpPostHtml(
      equip({ photos: [], highlights: [], specs: [], youtubeUrls: [] }),
      { imageUrls: {} },
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<ul");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("<iframe");
  });

  it("사양 그룹이 여러 개면 그룹명 소제목이 각각 나온다", () => {
    const html = renderWpPostHtml(
      equip({
        specs: [
          { group: "규격", icon: "ruler", items: [{ id: "a", label: "폭", value: "1m" }] },
          { group: "전원", icon: "power", items: [{ id: "b", label: "전압", value: "220V" }] },
        ],
      }),
      { imageUrls: urls },
    );
    expect(html).toContain("규격");
    expect(html).toContain("전원");
  });

  it("XSS: 이름·사양·highlights의 HTML 특수문자를 전부 이스케이프한다", () => {
    const html = renderWpPostHtml(
      equip({
        name: '<script>alert("x")</script>',
        highlights: ['"><img src=x onerror=1>'],
        specs: [
          {
            group: "<b>g</b>",
            icon: "settings",
            items: [{ id: "s", label: "l&l", value: "'v'" }],
          },
        ],
      }),
      { imageUrls: urls },
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("onerror=1>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("l&amp;l");
  });

  it("유튜브가 아닌 URL·javascript: URL은 드롭한다 (임의 iframe 차단)", () => {
    const html = renderWpPostHtml(
      equip({
        youtubeUrls: [
          "https://evil.example/embed/abc",
          "javascript:alert(1)",
          "https://www.youtube.com/watch?v=456ADQ8-8Xo",
        ],
      }),
      { imageUrls: urls },
    );
    expect(html).not.toContain("evil.example");
    expect(html).not.toContain("javascript:");
    // 유효한 1건만 렌더
    expect(html.match(/<iframe/g)).toHaveLength(1);
    expect(html).toContain("https://www.youtube-nocookie.com/embed/456ADQ8-8Xo");
  });

  it("가격 관련 내용은 어떤 입력에서도 렌더되지 않는다 (스냅샷 안전망)", () => {
    const html = renderWpPostHtml(equip(), { imageUrls: urls });
    expect(html).not.toMatch(/가격|원|price/i);
  });

  it("videoThumbnails 옵션이면 iframe 대신 정적 썸네일을 렌더한다 (sandbox 미리보기용)", () => {
    const html = renderWpPostHtml(equip(), { imageUrls: urls, videoThumbnails: true });
    expect(html).not.toContain("<iframe");
    expect(html).toContain("https://img.youtube.com/vi/456ADQ8-8Xo/hqdefault.jpg");
    expect(html).toContain("실제 글에서 재생됩니다");
  });

  it("동일 입력 → 동일 출력 (결정적 스냅샷)", () => {
    const html = renderWpPostHtml(equip(), { imageUrls: urls });
    expect(html).toMatchSnapshot();
  });
});
