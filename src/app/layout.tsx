import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

const configuredSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(configuredSiteUrl),
  title: "Планетарий вкуса Аси",
  description: "Прогулка по миру обоев Аси.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#080708",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className={GeistSans.className}>{children}</body>
    </html>
  );
}
