"use client";

import * as React from "react";
import { Phone } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { isValidAuE164Mobile, normalizeAuMobileToE164 } from "@/server/phone/auMobile";

const DEFAULT_ERROR_MESSAGE = "Enter an AU mobile like 0412 345 678";

type SmartPhoneInputProps = {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  error?: string;
  hideLabel?: boolean;
};

export function SmartPhoneInput({
  label,
  description,
  value,
  onChange,
  onBlur,
  disabled,
  required,
  name,
  error,
  hideLabel,
}: SmartPhoneInputProps) {
  const id = React.useId();
  const [internalError, setInternalError] = React.useState<string | null>(null);

  const displayError = error ?? internalError;
  const showSavedAs = value.trim().length > 0;
  const savedAsText = isValidAuE164Mobile(value) ? `Saved as ${value}` : "Saved as +614XXXXXXXX";

  const applyNormalization = React.useCallback(
    (nextValue: string) => {
      if (!nextValue.trim()) {
        setInternalError(null);
        return;
      }

      const normalized = normalizeAuMobileToE164(nextValue);
      if (normalized) {
        setInternalError(null);
        if (normalized !== nextValue) {
          onChange(normalized);
        }
      } else {
        setInternalError(DEFAULT_ERROR_MESSAGE);
      }
    },
    [onChange]
  );

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInternalError(null);
    onChange(event.target.value);
  };

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    applyNormalization(event.target.value);
    onBlur?.(event);
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pasteText = event.clipboardData.getData("text");
    if (!pasteText) return;

    const target = event.currentTarget;
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? target.value.length;
    const nextValue = `${target.value.slice(0, start)}${pasteText}${target.value.slice(end)}`;
    const normalized = normalizeAuMobileToE164(nextValue);

    if (normalized) {
      event.preventDefault();
      setInternalError(null);
      onChange(normalized);
      return;
    }

    setInternalError(nextValue.trim().length ? DEFAULT_ERROR_MESSAGE : null);
  };

  return (
    <div className="space-y-1">
      <Label htmlFor={id} className={cn(hideLabel && "sr-only")}>
        {label}
        {required ? " *" : null}
      </Label>
      <div className="relative">
        <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          name={name}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          onPaste={handlePaste}
          disabled={disabled}
          required={required}
          aria-invalid={Boolean(displayError)}
          className={cn(
            "pl-9",
            displayError && "border-destructive focus-visible:ring-destructive"
          )}
        />
      </div>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      {displayError ? (
        <p className="text-xs text-destructive">{displayError}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{showSavedAs ? savedAsText : "Saved as +614XXXXXXXX"}</p>
      )}
    </div>
  );
}
