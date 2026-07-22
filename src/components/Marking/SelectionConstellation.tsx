import { useMemo } from "react";
import type { Sample } from "@/lib/types";

export function SelectionConstellation({ samples, selectedIds }: { samples: Sample[]; selectedIds: string[] }) {
  const samplesById = useMemo(() => new Map(samples.map((sample) => [sample.id, sample])), [samples]);
  const selected = selectedIds
    .map((id) => samplesById.get(id))
    .filter((sample): sample is Sample => Boolean(sample));
  if (!selected.length) return null;
  return (
    <div className="selection-constellation" aria-label="Отмеченные обои">
      {selected.map((sample, index) => (
        <span
          key={sample.id}
          className="constellation-node"
          style={{
            backgroundColor: sample.dominantColor,
            backgroundImage: `url(${sample.srcset.sm})`,
            transform: `translate(${index * 12}px, ${Math.sin(index * 1.7) * 12}px) rotate(${index * 7 - 9}deg)`,
          }}
        />
      ))}
    </div>
  );
}
