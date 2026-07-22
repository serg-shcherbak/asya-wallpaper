"use client";

export function isTapGesture(
  start: { x: number; y: number },
  end: { x: number; y: number },
  threshold = 7,
) {
  return Math.hypot(end.x - start.x, end.y - start.y) <= threshold;
}

export function FocusProxy({
  sampleId,
  selected,
  onToggle,
}: {
  sampleId: string;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className="focus-proxy"
      style={{ width: 44, height: 44 }}
      aria-label={`Обои ${sampleId}, ${selected ? "отмечено" : "не отмечено"}`}
      aria-pressed={selected}
      onClick={() => onToggle(sampleId)}
    >
      <span aria-hidden="true" />
    </button>
  );
}
