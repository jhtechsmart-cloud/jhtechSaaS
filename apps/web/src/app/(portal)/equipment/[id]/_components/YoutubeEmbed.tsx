import { parseYoutubeId, youtubeEmbedUrl } from "@/lib/equipment/youtube";

// youtube_url → 임베드. 파싱 실패·null이면 렌더 안 함.
export function YoutubeEmbed({ url }: { url: string | null }) {
  const id = parseYoutubeId(url);
  if (!id) return null;
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-md bg-surface-2">
      <iframe
        src={youtubeEmbedUrl(id)}
        title="제품 영상"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
}
