import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "不動産市場分析 | 投資エリア分析",
  description: "不動産投資のための市場分析ダッシュボード — CCIM CI102手法に基づくエリア診断・経済基盤分析・経済圏評価",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=window.matchMedia('(prefers-color-scheme:dark)');function a(e){e.matches?document.documentElement.classList.add('dark'):document.documentElement.classList.remove('dark')}a(m);m.addEventListener('change',a)}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground"><TooltipProvider>{children}</TooltipProvider></body>
    </html>
  );
}
