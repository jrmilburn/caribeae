"use client";

import * as React from "react";
import { Bold, Image as ImageIcon, Italic, Link as LinkIcon, List, ListOrdered, RemoveFormatting, Underline } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const DEFAULT_MAX_WIDTH = 1200;
const DEFAULT_MAX_HEIGHT = 1200;

type RichEmailEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  maxImageWidth?: number;
  onMaxImageWidthChange?: (width: number) => void;
  maxImageHeight?: number;
  onMaxImageHeightChange?: (height: number) => void;
  className?: string;
};

export function RichEmailEditor({
  value,
  onChange,
  placeholder,
  maxImageWidth = DEFAULT_MAX_WIDTH,
  onMaxImageWidthChange,
  maxImageHeight = DEFAULT_MAX_HEIGHT,
  onMaxImageHeightChange,
  className,
}: RichEmailEditorProps) {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [selectedImage, setSelectedImage] = React.useState<HTMLImageElement | null>(null);

  React.useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || "";
    }
  }, [value]);

  const exec = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  };

  const handleLink = () => {
    const url = window.prompt("Enter URL");
    if (!url) return;
    exec("createLink", url);
  };

  const resizeImage = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let { width, height } = img;

          const widthRatio = maxImageWidth ? maxImageWidth / width : 1;
          const heightRatio = maxImageHeight ? maxImageHeight / height : 1;
          const ratio = Math.min(widthRatio, heightRatio, 1);

          width *= ratio;
          height *= ratio;

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Failed to prepare image"));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL(file.type || "image/png"));
        };
        img.onerror = () => reject(new Error("Unable to load image"));
        img.src = event.target?.result as string;
      };
      reader.onerror = () => reject(new Error("Unable to read file"));
      reader.readAsDataURL(file);
    });

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await resizeImage(file);
      exec("insertImage", dataUrl);
    } catch (error) {
      console.error("Image upload failed", error);
    } finally {
      event.target.value = "";
    }
  };

  const handleInput = () => {
    const html = editorRef.current?.innerHTML ?? "";
    onChange(html);
  };

  React.useEffect(() => {
    const handleSelectionChange = () => {
      const selection = document.getSelection();
      if (!selection || selection.rangeCount === 0) {
        setSelectedImage(null);
        return;
      }

      const node = selection.anchorNode;
      if (!node) {
        setSelectedImage(null);
        return;
      }

      const element = node instanceof HTMLElement ? node : node.parentElement;
      const image = element?.closest("img");
      setSelectedImage(image ?? null);
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  const updateSelectedImageSize = (dimension: "width" | "height", value: number) => {
    if (!selectedImage) return;
    const next = Math.max(50, Math.min(2400, value));
    selectedImage.style[dimension] = `${next}px`;
    handleInput();
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => exec("bold")}
            aria-label="Bold"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => exec("italic")}
            aria-label="Italic"
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => exec("underline")}
            aria-label="Underline"
          >
            <Underline className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => exec("insertUnorderedList")}
            aria-label="Bulleted list"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => exec("insertOrderedList")}
            aria-label="Numbered list"
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleLink}
            aria-label="Add link"
          >
            <LinkIcon className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Insert image"
          >
            <ImageIcon className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => exec("removeFormat")}
            aria-label="Clear formatting"
          >
            <RemoveFormatting className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <span>Max width</span>
            <Input
              type="number"
              min={200}
              max={2400}
              value={maxImageWidth}
              onChange={(e) => {
                const width = Number(e.target.value);
                onMaxImageWidthChange?.(Number.isFinite(width) ? width : DEFAULT_MAX_WIDTH);
              }}
              className="h-8 w-20"
            />
            <span>px</span>
          </div>
          <div className="flex items-center gap-1">
            <span>Max height</span>
            <Input
              type="number"
              min={200}
              max={2400}
              value={maxImageHeight}
              onChange={(e) => {
                const height = Number(e.target.value);
                onMaxImageHeightChange?.(Number.isFinite(height) ? height : DEFAULT_MAX_HEIGHT);
              }}
              className="h-8 w-20"
            />
            <span>px</span>
          </div>
        </div>
      </div>

      {selectedImage ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/60 p-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Selected image size</span>
          <div className="flex items-center gap-1">
            <span>W</span>
            <Input
              type="number"
              min={50}
              max={2400}
              value={
                Number.parseInt(
                  selectedImage.style.width || `${selectedImage.width || selectedImage.naturalWidth}`,
                  10
                ) || selectedImage.width || selectedImage.naturalWidth
              }
              onChange={(e) => updateSelectedImageSize("width", Number(e.target.value))}
              className="h-7 w-20"
            />
            <span>px</span>
          </div>
          <div className="flex items-center gap-1">
            <span>H</span>
            <Input
              type="number"
              min={50}
              max={2400}
              value={
                Number.parseInt(
                  selectedImage.style.height || `${selectedImage.height || selectedImage.naturalHeight}`,
                  10
                ) || selectedImage.height || selectedImage.naturalHeight
              }
              onChange={(e) => updateSelectedImageSize("height", Number(e.target.value))}
              className="h-7 w-20"
            />
            <span>px</span>
          </div>
          <span className="text-muted-foreground">Click an image to adjust its dimensions.</span>
        </div>
      ) : null}

      <div
        ref={editorRef}
        className="min-h-[200px] w-full rounded-md border bg-background p-3 text-sm shadow-sm outline-none"
        contentEditable
        onInput={handleInput}
        onBlur={handleInput}
        data-placeholder={placeholder}
      />
      <style jsx>{`
        [contenteditable][data-placeholder]:empty::before {
          content: attr(data-placeholder);
          color: hsl(var(--muted-foreground));
          pointer-events: none;
        }

        [contenteditable] ul {
          list-style: disc;
          margin-left: 1.25rem;
          padding-left: 0.25rem;
        }

        [contenteditable] ol {
          list-style: decimal;
          margin-left: 1.25rem;
          padding-left: 0.25rem;
        }

        [contenteditable] li {
          margin-bottom: 0.25rem;
        }

        [contenteditable] img {
          max-width: 100%;
          height: auto;
        }
      `}</style>
    </div>
  );
}
