export interface MediaCardItem {
  title: string;
  type: 'video' | 'document' | 'slides' | 'image';
  description: string | null;
  url: string;
  thumbnailUrl: string | null;
}

const TYPE_LABEL: Record<MediaCardItem['type'], string> = {
  video: 'Video',
  document: 'Document',
  slides: 'Slides',
  image: 'Image',
};

export default function MediaCard({ item, children }: { item: MediaCardItem; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col overflow-hidden border border-stone bg-white">
      <div className="relative aspect-video bg-cream">
        {item.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-sage/40 text-xs uppercase tracking-[0.2em] text-forest">
            {TYPE_LABEL[item.type]}
          </div>
        )}
        <span className="absolute left-2 top-2 bg-ink/80 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-cream">
          {TYPE_LABEL[item.type]}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-heading text-lg text-ink">{item.title}</h3>
        {item.description && <p className="mt-1 flex-1 text-sm text-ink2/80">{item.description}</p>}
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block self-start bg-ink px-5 py-2 text-xs uppercase tracking-[0.15em] text-cream transition-colors hover:bg-terracotta"
        >
          Open / Download
        </a>
        {children}
      </div>
    </div>
  );
}
