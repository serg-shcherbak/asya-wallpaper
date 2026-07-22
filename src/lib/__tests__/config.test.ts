import { describe, expect, it } from "vitest";
import { safeContactUrl } from "../config";

describe("contact URL allowlist", () => {
  it.each(["https://t.me/asya", "mailto:asya@example.test", "tg://resolve?domain=asya"])(
    "accepts %s",
    (value) => expect(safeContactUrl(value)).toBe(value),
  );
  it.each(["", "javascript:alert(1)", "http://example.test", "data:text/html,no"])("rejects %s", (value) => {
    expect(safeContactUrl(value)).toBeNull();
  });
});
