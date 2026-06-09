export function SitePhotos({ photos }: { photos: { slot: string; label: string; url: string }[] }) {
  if (photos.length === 0) return null;
  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <h2 className="mb-2 text-h2 font-medium text-text">현장 사진</h2>
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
