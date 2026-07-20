import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reef Command",
  description:
    "One week of a coral business, run from one chat window. ClickHouse × Trigger.dev — Beyond the Wall of Text.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="relative z-10 flex min-h-full flex-col">{children}</body>
    </html>
  );
}
