export function canonicalResultUrl(islandId: string, currentOrigin: string): string {
  const origin = new URL(currentOrigin).origin;
  return new URL(`/result/${encodeURIComponent(islandId)}/`, origin).toString();
}

type ShareNavigator = {
  share?: (data: ShareData) => Promise<void>;
  clipboard?: { writeText: (value: string) => Promise<void> };
};

export async function shareIsland(
  islandId: string,
  islandName: string,
  currentOrigin: string,
  browserNavigator: ShareNavigator = navigator,
): Promise<"shared" | "copied"> {
  const url = canonicalResultUrl(islandId, currentOrigin);
  if (browserNavigator.share) {
    await browserNavigator.share({ title: `${islandName}. Мир Аси`, url });
    return "shared";
  }
  if (!browserNavigator.clipboard) throw new Error("Sharing is unavailable in this browser");
  await browserNavigator.clipboard.writeText(url);
  return "copied";
}
