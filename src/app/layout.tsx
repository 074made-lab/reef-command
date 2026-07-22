import type { Metadata } from "next";
import {
  PROJECT_AUTHOR,
  PROJECT_CREDIT,
  PROJECT_GITHUB_URL,
  PROJECT_LINKEDIN_URL,
} from "@/lib/project-credit";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reef Command",
  description:
    "One week of a coral business, run from one chat window. ClickHouse × Trigger.dev — Beyond the Wall of Text.",
  authors: [{ name: PROJECT_AUTHOR, url: PROJECT_GITHUB_URL }],
  creator: PROJECT_AUTHOR,
  other: {
    "project-credit": PROJECT_CREDIT,
    "author-github": PROJECT_GITHUB_URL,
    "author-linkedin": PROJECT_LINKEDIN_URL,
  },
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
