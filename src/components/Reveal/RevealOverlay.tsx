"use client";

import type { Island, Sample } from "@/lib/types";

export function RevealOverlay({
  island,
  collection,
  onContinue,
  contactUrl,
  onShare,
  shareStatus,
}: {
  island: Island;
  collection: Sample[];
  onContinue: () => void;
  contactUrl?: string | null;
  onShare?: () => void;
  shareStatus?: "idle" | "copied" | "shared" | "error";
}) {
  const webContact = contactUrl?.startsWith("https:");
  return (
    <section className="reveal" role="dialog" aria-modal="true" aria-labelledby="island-title">
      <div className="reveal-scrim" />
      <div className="reveal-content">
        <p className="reveal-kicker">Твой остров в мире Аси</p>
        <h1 id="island-title">{island.name}</h1>
        <div className="reveal-ribbon" aria-label="Подборка острова">
          {collection.slice(0, 9).map((sample) => (
            // Generated WebP files are already square and carry fixed dimensions.
            // eslint-disable-next-line @next/next/no-img-element
            <img key={sample.id} src={sample.srcset.md} alt="" width={180} height={180} />
          ))}
        </div>
        <div className="reveal-actions">
          <button type="button" className="action action-primary" onClick={onContinue}>
            Продолжить смотреть
          </button>
          {contactUrl ? (
            <a
              className="action action-quiet"
              href={contactUrl}
              target={webContact ? "_blank" : undefined}
              rel={webContact ? "noopener noreferrer" : undefined}
            >
              Хочу так же у себя
            </a>
          ) : null}
          {onShare ? (
            <button type="button" className="action action-quiet" onClick={onShare}>
              {shareStatus === "copied" ? "Ссылка скопирована" : shareStatus === "shared" ? "Открыто меню шэра" : "Поделиться"}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
