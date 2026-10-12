import type { Metadata } from "next";
import { themeBootstrap } from "@/lib/theme.js";
import "./globals.css";
import "./themes.css";
import "./premium.css";
import "./auth.css";
import "./members.css";
import "./guests.css";

export const metadata: Metadata = {
  title: "Vine Branch · Member Care",
  description:
    "Frontend review of the Vine Branch Church visitor and member care experience.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script
          id="care-theme-init"
          dangerouslySetInnerHTML={{ __html: themeBootstrap }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
