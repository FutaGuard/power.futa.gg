import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://power.futa.gg"),
  title: "台灣電力即時資訊 · power.futa.gg",
  description:
    "一次掌握台灣即時與歷史用電、發電結構、區域供需、備轉容量與各機組發電狀態。",
  applicationName: "台灣電力",
  alternates: { canonical: "https://power.futa.gg" },
  openGraph: {
    type: "website",
    locale: "zh_TW",
    url: "https://power.futa.gg",
    siteName: "power.futa.gg",
    title: "台灣電力即時資訊 · power.futa.gg",
    description:
      "看懂此刻與過去的台灣用電、發電結構，以及四大區域的供需狀態。",
    images: [
      {
        url: "/og-energy.png",
        width: 1200,
        height: 630,
        alt: "台灣電力即時資訊、能源發電曲線與區域供需地圖",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "台灣電力即時資訊 · power.futa.gg",
    description:
      "看懂此刻與過去的台灣用電、發電結構，以及四大區域的供需狀態。",
    images: ["/og-energy.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f5ea" },
    { media: "(prefers-color-scheme: dark)", color: "#111914" },
  ],
};

const themeScript = `
(() => {
  try {
    const saved = localStorage.getItem("power-theme");
    const dark = saved === "dark" || (!saved && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  } catch {}
})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
