import type { Metadata } from "next";
import "./globals.css";
import { APP_NAME } from "@/lib/appConfig";

export const metadata: Metadata = {
  title: APP_NAME,
  description:
    "WLKATA Mirobot 6-DOF Robot Arm Web Simulator — FK/IK, 3D Gizmos, Path Planning (MoveJ/MoveL/MoveC), and G-code.",
};

// Runs before first paint so a refresh shows the saved theme instead of flashing dark.
// Must match resolveIsDark() in stores/useThemeStore.ts.
const THEME_BOOT_SCRIPT = `(function(){try{var m=localStorage.getItem("themeMode");if(m!=="dark"&&m!=="light")m="auto";var h=new Date().getHours();var d=m==="dark"||(m==="auto"&&!(h>=7&&h<18));document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

// Sets <html lang> before first paint. Must match detectLocale() in lib/i18n/index.ts.
const LOCALE_BOOT_SCRIPT = `(function(){var l="en";try{var s=localStorage.getItem("locale");if(s==="en"||s==="th")l=s;else if((navigator.language||"").toLowerCase().indexOf("th")===0)l="th";}catch(e){}document.documentElement.lang=l;})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: LOCALE_BOOT_SCRIPT }} />
      </head>
      <body className="bg-slate-100 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}
