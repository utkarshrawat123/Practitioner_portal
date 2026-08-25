import { Button } from '@/components/ui';

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
    <div className="flex flex-col overflow-hidden rounded-card bg-white shadow-card transition-shadow hover:shadow-lift">
      <div className="relative aspect-video bg-blush">
        {item.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-sage-pale text-[11px] uppercase tracking-label text-ink2/60">
            {TYPE_LABEL[item.type]}
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-pill bg-navy/85 px-3 py-1 text-[10px] font-semibold uppercase tracking-label text-white">
          {TYPE_LABEL[item.type]}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-heading text-[19px] leading-snug text-ink">{item.title}</h3>
        {item.description && (
          <p className="mt-1.5 flex-1 text-[14px] leading-relaxed text-ink2/70">{item.description}</p>
        )}
        <Button href={item.url} newTab className="mt-4 self-start">
          Open / Download
        </Button>
        {children}
      </div>
    </div>
  );
}
