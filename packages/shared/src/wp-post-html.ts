// WP 글 본문 자체 HTML 템플릿(순수) — Elementor 복제 아님(#253 D2).
// 가격·옵션 제외. 사용자 입력 전부 이스케이프. 유튜브는 ID 추출 성공분만 nocookie embed.
// 이미지 src는 호출자가 주입(워커=WP 미디어 URL, SaaS 미리보기=storage 공개 URL) —
// 렌더는 맵에 있는 사진만(업로드 실패분 미노출).
import type { SpecGroup } from "./specs";
import { parseYoutubeId, youtubeEmbedUrl } from "./youtube";

export interface WpPostEquipment {
  name: string;
  model: string | null;
  photos: string[];
  highlights: string[];
  specs: SpecGroup[];
  youtubeUrls: string[];
}

export interface WpPostRenderOptions {
  /** storage 경로 → 렌더에 쓸 이미지 URL */
  imageUrls: Record<string, string>;
}

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderWpPostHtml(
  equipment: WpPostEquipment,
  options: WpPostRenderOptions,
): string {
  const parts: string[] = [];

  // 사진: URL 맵에 있는 것만, 첫 장이 대표
  const images = equipment.photos
    .map((path) => options.imageUrls[path])
    .filter((url): url is string => typeof url === "string" && url.length > 0);
  for (const url of images) {
    parts.push(
      `<figure class="jh-wp-photo"><img src="${esc(url)}" alt="${esc(equipment.name)}" loading="lazy" /></figure>`,
    );
  }

  // 핵심 특징
  const highlights = equipment.highlights.filter((h) => h.trim() !== "");
  if (highlights.length > 0) {
    parts.push(
      `<ul class="jh-wp-highlights">${highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>`,
    );
  }

  // 사양표: 그룹별 표. 그룹명이 있으면 소제목.
  for (const group of equipment.specs) {
    if (group.items.length === 0) continue;
    const heading = group.group.trim() !== "" ? `<h3>${esc(group.group)}</h3>` : "";
    const rows = group.items
      .map((i) => `<tr><th scope="row">${esc(i.label)}</th><td>${esc(i.value)}</td></tr>`)
      .join("");
    parts.push(`${heading}<table class="jh-wp-specs"><tbody>${rows}</tbody></table>`);
  }

  // 유튜브: 화이트리스트 통과분만 embed, 비매칭 URL은 드롭
  for (const url of equipment.youtubeUrls) {
    const id = parseYoutubeId(url);
    if (!id) continue;
    parts.push(
      `<div class="jh-wp-video"><iframe src="${youtubeEmbedUrl(id)}" title="${esc(equipment.name)}" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`,
    );
  }

  return parts.join("\n");
}
