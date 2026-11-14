import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Tracely", template: "%s · Tracely" },
  description: "Traces, cost, and reliability for LLM applications.",
};

// Applies the saved theme before first paint so the page never flashes the wrong one.
const themeScript = `try{var t=localStorage.getItem("tracely-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
