"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Image as ImageIcon, Italic, List, ListOrdered, Bold, Underline, Link2 } from "lucide-react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

function stripTrailingBr(html: string) {
  return html.replace(/<br>\s*$/, "");
}

export function RichTextEditor({ value, onChange, placeholder, className }: Props) {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!editorRef.current) return;
    if (editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || "";
    }
  }, [value]);

  const handleInput = () => {
    if (!editorRef.current) return;
    const html = stripTrailingBr(editorRef.current.innerHTML);
    onChange(html);
  };

  const exec = (command: string, arg?: string) => {
    document.execCommand(command, false, arg);
    handleInput();
  };

  const handleLink = () => {
    const url = window.prompt("Enter URL");
    if (!url) return;
    exec("createLink", url);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/email/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || "Upload failed");
      }
      exec("insertImage", data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (event.target) event.target.value = "";
    }
  };

  const showPlaceholder = !value || contentLength(value) === 0;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="icon" onClick={() => exec("bold")} aria-label="Bold">
          <Bold className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" onClick={() => exec("italic")} aria-label="Italic">
          <Italic className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" onClick={() => exec("underline")} aria-label="Underline">
          <Underline className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => exec("insertUnorderedList")}
          aria-label="Bulleted list"
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => exec("insertOrderedList")}
          aria-label="Numbered list"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" onClick={handleLink} aria-label="Insert link">
          <Link2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleUploadClick}
          aria-label="Insert image"
          disabled={uploading}
        >
          <ImageIcon className="h-4 w-4" aria-hidden="true" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
        {uploading && <span className="text-xs text-muted-foreground">Uploading…</span>}
      </div>

      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          className="min-h-[180px] w-full rounded-md border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onInput={handleInput}
          suppressContentEditableWarning
          aria-label="Rich text editor"
        />
        {showPlaceholder && placeholder && (
          <div className="pointer-events-none absolute left-3 top-3 select-none text-sm text-muted-foreground opacity-60">
            {placeholder}
          </div>
        )}
      </div>
      {error && <div className="text-xs text-destructive">{error}</div>}
    </div>
  );
}

function contentLength(val: string) {
  const plain = val.replace(/<[^>]+>/g, "").trim();
  return plain.length;
}
