"use client";

import * as React from "react";

type UseBarcodeScannerOptions = {
  enabled?: boolean;
  onScan: (barcode: string) => void;
};

// Replace this hook with a hardware-specific integration later; keep calling onScan(barcode).
export function useBarcodeScanner({ enabled = true, onScan }: UseBarcodeScannerOptions) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const bufferRef = React.useRef("");

  const focusScanner = React.useCallback(() => {
    if (!enabled) return;
    inputRef.current?.focus();
  }, [enabled]);

  React.useEffect(() => {
    if (!enabled) return;
    const handle = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(handle);
  }, [enabled]);

  const handleChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!enabled) return;
      bufferRef.current = event.target.value;
    },
    [enabled]
  );

  const resetBuffer = React.useCallback(() => {
    bufferRef.current = "";
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, []);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (!enabled) return;
      if (event.key === "Enter") {
        const barcode = bufferRef.current.trim();
        if (barcode) {
          onScan(barcode);
        }
        resetBuffer();
      }
    },
    [enabled, onScan, resetBuffer]
  );

  const handleBlur = React.useCallback(
    (event: React.FocusEvent<HTMLInputElement>) => {
      if (!enabled) return;
      const next = event.relatedTarget as HTMLElement | null;
      if (next) {
        const tag = next.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || next.isContentEditable) {
          return;
        }
      }
      window.setTimeout(() => {
        if (!enabled) return;
        inputRef.current?.focus();
      }, 0);
    },
    [enabled]
  );

  return {
    inputRef,
    focusScanner,
    resetBuffer,
    inputProps: {
      onChange: handleChange,
      onKeyDown: handleKeyDown,
      onBlur: handleBlur,
    },
  };
}
