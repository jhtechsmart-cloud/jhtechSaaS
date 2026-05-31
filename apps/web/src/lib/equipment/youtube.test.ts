import { describe, it, expect } from "vitest";
import { parseYoutubeId, youtubeEmbedUrl } from "./youtube";

describe("parseYoutubeId", () => {
  it("watch?v= 형식", () => {
    expect(parseYoutubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("youtu.be 단축", () => {
    expect(parseYoutubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("/embed/·/shorts/ 형식", () => {
    expect(parseYoutubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYoutubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("null·빈문자·비유튜브·잘못된 id → null", () => {
    expect(parseYoutubeId(null)).toBeNull();
    expect(parseYoutubeId("")).toBeNull();
    expect(parseYoutubeId("https://example.com/watch?v=abc")).toBeNull();
    expect(parseYoutubeId("not a url")).toBeNull();
    expect(parseYoutubeId("https://www.youtube.com/watch?v=short")).toBeNull();
  });
});

describe("youtubeEmbedUrl", () => {
  it("nocookie 임베드 URL", () => {
    expect(youtubeEmbedUrl("dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  });
});
