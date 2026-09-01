import type { ImageResult } from "@/lib/agents/plugins/image-blocks";

export function ImageResultView({ result }: { result: ImageResult }) {
  return (
    <div className="space-y-2">
      {result.images.map((image, index) => (
        <img
          key={`${image.src.slice(0, 64)}-${index}`}
          src={image.src}
          alt={image.alt}
          className="max-h-[360px] w-auto rounded-xl border border-border/50 object-contain"
        />
      ))}
      {result.text ? (
        <p className="ag-faint whitespace-pre-wrap break-words text-[11px]">
          {result.text}
        </p>
      ) : null}
    </div>
  );
}
