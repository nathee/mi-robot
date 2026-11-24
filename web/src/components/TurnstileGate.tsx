"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { APP_NAME } from "@/lib/appConfig";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileRenderOptions {
  sitekey: string;
  theme?: "auto" | "light" | "dark";
  callback?: (token: string) => void;
  "error-callback"?: (code?: string) => void;
  "expired-callback"?: () => void;
}

interface TurnstileApi {
  render: (el: HTMLElement, opts: TurnstileRenderOptions) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing"));
    script.onerror = () => {
      scriptPromise = null;
      script.remove();
      reject(new Error("failed to load turnstile"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

type Status = "loading" | "ready" | "verifying" | "error";

export function TurnstileGate({
  siteKey,
  children,
}: {
  siteKey: string;
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);

  const onToken = useCallback(async (token: string) => {
    setStatus("verifying");
    try {
      const res = await fetch("/api/turnstile/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && data.ok) {
        setVerified(true);
        return;
      }
      setStatus("error");
      setMessage("Verification failed. Please try again.");
    } catch {
      setStatus("error");
      setMessage("Could not reach the server. Check your connection and try again.");
    }
    if (window.turnstile && widgetIdRef.current) window.turnstile.reset(widgetIdRef.current);
  }, []);

  useEffect(() => {
    if (verified) return;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !containerRef.current) return;
        widgetIdRef.current = api.render(containerRef.current, {
          sitekey: siteKey,
          theme: "auto",
          callback: (token) => void onToken(token),
          "error-callback": () => {
            setStatus("error");
            setMessage("The security check hit an error. Please retry.");
          },
          "expired-callback": () => {
            setStatus("ready");
            setMessage("The check expired. Please verify again.");
          },
        });
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
        setMessage("Could not load the security check. Disable blockers for challenges.cloudflare.com and retry.");
      });
    return () => {
      cancelled = true;
      if (window.turnstile && widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, onToken, verified, attempt]);

  if (verified) return <>{children}</>;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-sky-500" aria-hidden />
        <h1 className="text-lg font-semibold">{APP_NAME}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Confirm you are human to open the simulator.
        </p>
        <div ref={containerRef} className="mt-5 flex min-h-[65px] justify-center" />
        <p className="mt-3 min-h-5 text-sm" role="status" aria-live="polite">
          {status === "loading" && <span className="text-slate-500">Loading security check…</span>}
          {status === "verifying" && <span className="text-slate-500">Verifying…</span>}
          {status !== "loading" && status !== "verifying" && message && (
            <span className={status === "error" ? "text-red-500" : "text-slate-500"}>{message}</span>
          )}
        </p>
        {status === "error" && (
          <button
            type="button"
            onClick={() => {
              setMessage("");
              setStatus("loading");
              setAttempt((n) => n + 1);
            }}
            className="mt-3 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
          >
            Retry
          </button>
        )}
      </div>
    </main>
  );
}
