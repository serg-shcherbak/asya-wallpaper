"use client";

/* eslint-disable @next/next/no-img-element -- Native loading="lazy" keeps deferred static samples out of the initial decode queue. */

import { useState } from "react";
import type { Sample } from "@/lib/types";

export const INITIAL_FALLBACK_SAMPLE_COUNT = 24;
const FALLBACK_SAMPLE_BATCH_SIZE = 24;

export function FallbackWorld({
  samples,
  selectedIds,
  onToggle,
}: {
  samples: Sample[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_FALLBACK_SAMPLE_COUNT);
  const visibleSamples = samples.slice(0, visibleCount);
  const hasMore = visibleSamples.length < samples.length;

  return (
    <section className="fallback-world" aria-label="Упрощённый купол обоев">
      <div className="fallback-dome">
        {visibleSamples.map((sample, index) => {
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
              }}
              onClick={() => onToggle(sample.id)}
            >
              <img
                src={sample.srcset.sm}
                alt=""
                aria-hidden="true"
                loading={index < INITIAL_FALLBACK_SAMPLE_COUNT ? "eager" : "lazy"}
                decoding="async"
              />
            </button>
          );
        })}
      </div>
      {hasMore ? (
        <button
          type="button"
          className="fallback-load-more action action-quiet"
          onClick={() => setVisibleCount((count) => Math.min(count + FALLBACK_SAMPLE_BATCH_SIZE, samples.length))}
        >
          Показать ещё обои
        </button>
      ) : null}
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
