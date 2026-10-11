import type { Metadata, Viewport } from "next"
import { Bodoni_Moda, Geist_Mono, Mulish } from "next/font/google"
import { Providers } from "@/components/providers"
import "./globals.css"

// The Umbra type set, as on ProX: Bodoni Moda for display, Mulish for the interface, Geist Mono for figures.
const bodoni = Bodoni_Moda({ variable: "--font-bodoni", subsets: ["latin"], style: ["normal", "italic"] })
const mulish = Mulish({ variable: "--font-mulish", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], weight: ["400", "500"] })

export const metadata: Metadata = {
  title: { default: "Tailcoat", template: "%s | Tailcoat" },
  description:
    "Copy the stock trades members of Congress and insiders disclose, into bStocks on BNB Chain, from your own wallet. Every fill traces back to the public filing.",
}

export const viewport: Viewport = { themeColor: "#ECE5D3" }

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bodoni.variable} ${mulish.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
