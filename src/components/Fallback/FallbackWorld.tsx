"use client";

import type { Sample } from "@/lib/types";

export function FallbackWorld({
  samples,
  selectedIds,
  onToggle,
}: {
  samples: Sample[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <section className="fallback-world" aria-label="Упрощённый купол обоев">
      <div className="fallback-dome">
        {samples.map((sample, index) => {
          const selected = selectedIds.has(sample.id);
          return (
            <button
              type="button"
              key={sample.id}
              aria-label={`Обои ${sample.id}`}
              aria-pressed={selected}
              className="fallback-sample"
              style={{
                left: `${8 + ((index * 29) % 84)}%`,
                top: `${10 + ((index * 43) % 76)}%`,
                backgroundColor: sample.dominantColor,
                backgroundImage: `url(${sample.srcset.sm})`,
              }}
              onClick={() => onToggle(sample.id)}
            />
          );
        })}
      </div>
    </section>
  );
}

export function DataError({ onRetry, contactUrl }: { onRetry: () => void; contactUrl?: string | null }) {
  return (
    <main className="data-error">
      <p>Мир не собрался</p>
      <button type="button" className="action action-primary" onClick={onRetry}>
        Повторить
      </button>
      {contactUrl ? (
        <a className="action action-quiet" href={contactUrl}>
          Написать Асе
        </a>
      ) : null}
    </main>
  );
}
