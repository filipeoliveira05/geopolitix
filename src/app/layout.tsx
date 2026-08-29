import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Geopolitix",
  description: "Learn the US political system and geography, state by state.",
};

// No global footer here — the home page (/) is a deliberately chrome-free
// h-dvh fullscreen map (see UsMap's own framing conventions), and adding
// any extra row here would either overflow that fixed viewport height or
// get clipped. GlobalFooter (src/components/GlobalFooter.tsx) is instead
// dropped into every other top-level page individually, which use normal
// scrolling document flow.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
