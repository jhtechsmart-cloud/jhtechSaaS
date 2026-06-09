import { SectionHeader } from "./SectionHeader";

export function SitePhotos({ photos }: { photos: { slot: string; label: string; url: string }[] }) {
  if (photos.length === 0) return null;
  return (
    <section className="rounded-lg border border-border/60 bg-surface p-5 shadow-sm">
      <SectionHeader title="현장 사진" />
      <div className="grid grid-cols-2 gap-3">
        {photos.map((p) => (
          <figure key={p.slot} className="flex flex-col gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.label} className="aspect-[4/3] w-full rounded-sm object-cover" />
            <figcaption className="text-micro text-muted">{p.label}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
