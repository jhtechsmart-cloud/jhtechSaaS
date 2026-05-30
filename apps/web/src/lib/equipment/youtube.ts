// youtube_url → 임베드 id 추출(순수). 지원: watch?v=, youtu.be/, /embed/, /shorts/.
// id는 정확히 11자 [A-Za-z0-9_-]. 형식 외·null이면 null. (DB의 youtube_url은 E2에서 호스트 제한됨 — 방어적 재검증.)
const YOUTUBE_ID = /^[a-zA-Z0-9_-]{11}$/;

export function parseYoutubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = u.pathname.slice(1);
  } else if (host === "youtube.com" || host === "m.youtube.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else if (u.pathname.startsWith("/embed/")) id = u.pathname.slice("/embed/".length);
    else if (u.pathname.startsWith("/shorts/")) id = u.pathname.slice("/shorts/".length);
  }
  if (id) id = id.split("/")[0];
  return id && YOUTUBE_ID.test(id) ? id : null;
}

export function youtubeEmbedUrl(id: string): string {
  // privacy-enhanced 도메인(youtube-nocookie).
  return `https://www.youtube-nocookie.com/embed/${id}`;
}
