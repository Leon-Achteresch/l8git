import { Fragment, useState, type ReactNode } from "react";

export function ProgressiveCapabilityList<T>({
  items,
  getKey,
  renderItem,
  resetKey,
  moreLabel,
  initialCount = 80,
  batchSize = 100,
}: {
  items: readonly T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  resetKey: string;
  moreLabel: (count: number) => string;
  initialCount?: number;
  batchSize?: number;
}) {
  const [pagination, setPagination] = useState({ resetKey, limit: initialCount });
  const limit = pagination.resetKey === resetKey ? pagination.limit : initialCount;
  const remaining = Math.max(0, items.length - limit);

  return (
    <>
      {items.slice(0, limit).map((item) => (
        <Fragment key={getKey(item)}>{renderItem(item)}</Fragment>
      ))}
      {remaining > 0 ? (
        <button
          type="button"
          className="ag-pill mt-2 h-8 w-full justify-center"
          onClick={() => setPagination({ resetKey, limit: limit + batchSize })}
        >
          {moreLabel(Math.min(batchSize, remaining))}
        </button>
      ) : null}
    </>
  );
}
