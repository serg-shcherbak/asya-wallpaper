"use client";

import { useEffect, useRef } from "react";
import { shareStatusLabel, type ShareStatus } from "@/lib/share";
import type { Island, Sample } from "@/lib/types";

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  shareStatus?: ShareStatus;
}) {
  const dialog = useRef<HTMLElement>(null);
  const webContact = contactUrl?.startsWith("https:");

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const siblings = [...(element.parentElement?.children ?? [])]
      .filter((sibling) => sibling !== element)
      .map((sibling) => {
        const htmlSibling = sibling as HTMLElement;
        const state = {
          element: htmlSibling,
          inert: htmlSibling.inert,
          ariaHidden: htmlSibling.getAttribute("aria-hidden"),
        };
        htmlSibling.inert = true;
        htmlSibling.setAttribute("aria-hidden", "true");
        return state;
      });
    element.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    return () => {
      for (const state of siblings) {
        state.element.inert = state.inert;
        if (state.ariaHidden === null) state.element.removeAttribute("aria-hidden");
        else state.element.setAttribute("aria-hidden", state.ariaHidden);
      }
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  const trapFocus = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab" || !dialog.current) return;
    const focusable = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) {
      event.preventDefault();
      dialog.current.focus();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <section
      ref={dialog}
      className="reveal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="island-title"
      tabIndex={-1}
      onKeyDown={trapFocus}
    >
      <div className="reveal-scrim" aria-hidden="true" />
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
              {shareStatusLabel(shareStatus ?? "idle")}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
