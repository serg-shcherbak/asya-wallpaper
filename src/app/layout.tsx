import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
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
      <body>{children}</body>
    </html>
  );
}
