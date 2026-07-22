"use client";

import { useState } from "react";
import Link from "next/link";
import { shareIsland, shareStatusLabel, type ShareStatus } from "@/lib/share";

export function ResultActions({
  islandId,
  islandName,
  contactUrl,
}: {
  islandId: string;
  islandName: string;
  contactUrl: string | null;
}) {
  const [status, setStatus] = useState<ShareStatus>("idle");
  const webContact = contactUrl?.startsWith("https:");
  return (
    <div className="result-actions">
      <Link className="action action-primary" href="/">
        Войти в мир
      </Link>
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
      <button
        type="button"
        className="action action-quiet"
        onClick={async () => {
          try {
            setStatus(await shareIsland(islandId, islandName, window.location.origin));
          } catch {
            setStatus("error");
          }
        }}
      >
        {shareStatusLabel(status)}
      </button>
    </div>
  );
}
