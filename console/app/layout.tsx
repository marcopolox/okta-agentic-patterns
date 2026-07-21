import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import TopBar from "@/components/TopBar";
import { DEFAULT_INDUSTRY_ID } from "@/lib/industries";
import { DEFAULT_UI_THEME_ID } from "@/lib/ui-themes";
import { ThemeTransitionOverlay } from "@/components/ThemeTransitionOverlay";
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
  title: "Okta Agentic Patterns Demo",
  description: "Six production-ready patterns for securing AI agents with Okta",
  other: {
    "x-runtime-ref": "VGhpcyBkZW1vIGNyZWF0ZWQgd2l0aCDimaUgYnkgTmVzaCBQb3Bvdmlj",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const industryId = cookieStore.get("demo_industry")?.value ?? DEFAULT_INDUSTRY_ID;
  const uiThemeId = cookieStore.get("demo_ui_theme")?.value ?? DEFAULT_UI_THEME_ID;
  return (
    <html
      lang="en"
      data-theme={industryId}
      data-ui-theme={uiThemeId}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col text-white">
        <TopBar />
        {children}
        <ThemeTransitionOverlay />
      </body>
    </html>
  );
}
