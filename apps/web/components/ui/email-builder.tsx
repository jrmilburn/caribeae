"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

type UnlayerEditor = {
  init: (options: Record<string, unknown>) => void;
  loadDesign: (design: Record<string, unknown>) => void;
  exportHtml: (callback: (data: { design: unknown; html: string }) => void) => void;
  addEventListener: (event: string, callback: () => void) => void;
};

declare global {
  interface Window {
    unlayer?: UnlayerEditor;
  }
}

export type EmailBuilderHandle = {
  exportHtml: () => Promise<string>;
  clear: () => void;
};

const EmailEditorShell = dynamic(() => Promise.resolve(() => null), { ssr: false });

type EmailBuilderProps = {
  className?: string;
  onReady?: () => void;
};

export const EmailBuilder = React.forwardRef<EmailBuilderHandle, EmailBuilderProps>(
  ({ className, onReady }, ref) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const containerId = React.useId();
    const [initialized, setInitialized] = React.useState(false);
    const initStarted = React.useRef(false);

    const ensureScript = React.useCallback(() => {
      if (typeof window === "undefined") return;
      if (window.unlayer) return Promise.resolve();

      return new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>('script[src="https://editor.unlayer.com/embed.js"]');
        if (existing) {
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", () => reject(new Error("Failed to load editor script")), { once: true });
          return;
        }

        const script = document.createElement("script");
        script.src = "https://editor.unlayer.com/embed.js";
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load editor script"));
        document.body.appendChild(script);
      });
    }, []);

    const createEditor = React.useCallback(async () => {
      if (initStarted.current || initialized) return;
      initStarted.current = true;
      try {
        await ensureScript();
        if (!window.unlayer || !containerRef.current) return;

        window.unlayer.init({
          id: containerId,
          displayMode: "email",
          source: "react-email-builder",
        });

        setInitialized(true);
        onReady?.();
      } finally {
        // allow retries if initialization failed
        if (!initialized) {
          initStarted.current = false;
        }
      }
    }, [containerId, ensureScript, initialized, onReady]);

    React.useEffect(() => {
      createEditor().catch((error) => {
        console.error(error);
      });
    }, [createEditor]);

    React.useImperativeHandle(
      ref,
      () => ({
        exportHtml: () =>
          new Promise<string>((resolve, reject) => {
            if (!window.unlayer) {
              reject(new Error("Email editor not ready"));
              return;
            }

            window.unlayer.exportHtml((data) => {
              if (!data?.html) {
                reject(new Error("No HTML to export"));
              } else {
                resolve(data.html);
              }
            });
          }),
        clear: () => {
          if (!window.unlayer) return;
          window.unlayer.loadDesign({
            body: { rows: [], values: {} },
          });
        },
      }),
      []
    );

    return (
      <div className={cn("space-y-2", className)}>
        <div
          ref={containerRef}
          id={containerId}
          className="min-h-[320px] h-full w-full overflow-hidden rounded-md border bg-background"
        >
          {!initialized ? (
            <div className="flex h-full w-full items-center justify-center p-4 text-sm text-muted-foreground">
              Loading email builder…
            </div>
          ) : null}
        </div>
        <EmailEditorShell />
      </div>
    );
  }
);

EmailBuilder.displayName = "EmailBuilder";
