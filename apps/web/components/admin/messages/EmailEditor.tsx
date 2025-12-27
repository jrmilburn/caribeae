"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export default function EmailEditor({
  subject,
  preheader,
  initialHtml = "",
  onChange,
}: {
  subject: string;
  preheader?: string;
  initialHtml?: string;
  onChange: (v: { subject: string; preheader?: string; html: string }) => void;
}) {
  const [subj, setSubj] = React.useState(subject);
  const [pre, setPre] = React.useState(preheader || "");

  const containerRef = React.useRef<HTMLDivElement>(null);
  const editorRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // selection memory
  const lastRangeRef = React.useRef<Range | null>(null);

  // image selection (state just to render the handle)
  const [selectedImg, setSelectedImg] = React.useState<HTMLImageElement | null>(null);
  const selectedImgRef = React.useRef<HTMLImageElement | null>(null);

  // drag state in refs (no rerenders while dragging)
  const draggingRef = React.useRef(false);
  const dragStartXRef = React.useRef(0);
  const dragStartWRef = React.useRef(0);

  const getHtml = React.useCallback(() => editorRef.current?.innerHTML || "", []);
  const emitChange = React.useCallback(() => {
    onChange({ subject: subj, preheader: pre, html: getHtml() });
  }, [onChange, subj, pre, getHtml]);

  const saveSelection = React.useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
      lastRangeRef.current = range;
    }
  }, []);

  const restoreSelection = React.useCallback(() => {
    const sel = window.getSelection();
    if (!sel || !lastRangeRef.current) return;
    sel.removeAllRanges();
    sel.addRange(lastRangeRef.current);
  }, []);

  React.useEffect(() => {
    if (editorRef.current && initialHtml && !editorRef.current.innerHTML) {
      editorRef.current.innerHTML = initialHtml;
    }
  }, [initialHtml]);

  function exec(cmd: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    emitChange();
  }

  const insertImageNode = React.useCallback(
    (url: string) => {
      if (!editorRef.current) return;
      editorRef.current.focus();
      restoreSelection();

      const sel = window.getSelection();
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      img.style.maxWidth = "100%";
      img.style.height = "auto";
      img.style.display = "block";

      if (!sel || sel.rangeCount === 0) {
        editorRef.current.appendChild(img);
        emitChange();
        return;
      }
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(img);
      range.setStartAfter(img);
      range.setEndAfter(img);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      lastRangeRef.current = range.cloneRange();
      emitChange();
    },
    [emitChange, restoreSelection]
  );

  const triggerImagePicker = () => {
    saveSelection();
    fileRef.current?.click();
  };

  const onFileChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const f = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!f) return;
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch("/api/email/upload", { method: "POST", body: fd });
      const data = (await r.json()) as { ok: boolean; url?: string; error?: string };
      if (!data.ok || !data.url) {
        toast.error(data.error || "Upload failed");
        return;
      }
      insertImageNode(data.url);
    } catch (err) {
      console.error(err);
      toast.error("Upload failed");
    }
  };

  // --- image selection
  const onEditorClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    const t = e.target as HTMLElement;
    if (t && t.tagName === "IMG") {
      const img = t as HTMLImageElement;
      setSelectedImg(img);
      selectedImgRef.current = img;
    } else {
      setSelectedImg(null);
      selectedImgRef.current = null;
    }
  };

  // handle positioning
  const handleRef = React.useRef<HTMLDivElement>(null);
  const positionHandle = React.useCallback(() => {
    const img = selectedImgRef.current;
    const handle = handleRef.current;
    const container = containerRef.current;
    if (!img || !handle || !container) return;
    const imgRect = img.getBoundingClientRect();
    const contRect = container.getBoundingClientRect();
    handle.style.left = `${imgRect.right - contRect.left - 8}px`;
    handle.style.top = `${imgRect.bottom - contRect.top - 8}px`;
  }, []);

  React.useEffect(() => {
    positionHandle();
  }, [selectedImg, positionHandle]);

  React.useEffect(() => {
    const rep = () => positionHandle();
    window.addEventListener("resize", rep);
    window.addEventListener("scroll", rep, true);
    return () => {
      window.removeEventListener("resize", rep);
      window.removeEventListener("scroll", rep, true);
    };
  }, [positionHandle]);

  // stable mouse handlers using refs
  const onMove = React.useCallback((e: MouseEvent) => {
    if (!draggingRef.current) return;
    const img = selectedImgRef.current;
    const cont = containerRef.current;
    if (!img || !cont) return;

    const dx = e.clientX - dragStartXRef.current;
    let newW = Math.max(40, Math.round(dragStartWRef.current + dx));
    const contRect = cont.getBoundingClientRect();
    newW = Math.min(newW, Math.round(contRect.width - 24));

    img.style.width = `${newW}px`;
    img.style.maxWidth = "100%";
    img.style.height = "auto";
    img.style.display = "block";
    img.setAttribute("width", String(newW)); // email-client friendly

    positionHandle();
  }, [positionHandle]);

  const onUp = React.useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    emitChange();
  }, [emitChange, onMove]);

  const onHandleMouseDown: React.MouseEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const img = selectedImgRef.current;
    if (!img) return;
    draggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartWRef.current = img.getBoundingClientRect().width;
    // prevent text selection while dragging
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (!selectedImgRef.current) return;
    if ((e.metaKey || e.ctrlKey) && ["1", "2", "3"].includes(e.key)) {
      e.preventDefault();
      const px = e.key === "1" ? 300 : e.key === "2" ? 450 : 600;
      const img = selectedImgRef.current;
      img.style.width = `${px}px`;
      img.style.maxWidth = "100%";
      img.style.height = "auto";
      img.style.display = "block";
      img.setAttribute("width", String(px));
      positionHandle();
      emitChange();
    }
  };

  const onBlur = () => emitChange();

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Subject</Label>
          <Input value={subj} onChange={(e) => setSubj(e.target.value)} onBlur={onBlur} />
        </div>
        <div className="space-y-2">
          <Label>Preheader (optional)</Label>
          <Input
            value={pre}
            onChange={(e) => setPre(e.target.value)}
            onBlur={onBlur}
            placeholder="Short summary shown in inbox"
          />
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap gap-2 border-b p-2">
          <Button type="button" variant="outline" size="sm" onMouseDown={saveSelection} onClick={() => exec("bold")}><b>B</b></Button>
          <Button type="button" variant="outline" size="sm" onMouseDown={saveSelection} onClick={() => exec("italic")}><i>I</i></Button>
          <Button type="button" variant="outline" size="sm" onMouseDown={saveSelection} onClick={() => exec("underline")}>U</Button>
          <Button type="button" variant="outline" size="sm" onMouseDown={saveSelection} onClick={() => exec("insertUnorderedList")}>• List</Button>
          <Button type="button" variant="outline" size="sm" onMouseDown={saveSelection} onClick={() => exec("insertOrderedList")}>1. List</Button>
          <Button type="button" variant="outline" size="sm" onMouseDown={saveSelection} onClick={() => exec("formatBlock", "<h2>")}>H2</Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onMouseDown={saveSelection}
            onClick={() => {
              const href = prompt("Link URL");
              if (href) exec("createLink", href);
            }}
          >
            Link
          </Button>

          <div className="ml-auto">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
            <Button variant="default" size="sm" type="button" onMouseDown={saveSelection} onClick={triggerImagePicker}>
              + Image
            </Button>
          </div>
        </div>

        <CardContent>
          <div ref={containerRef} className="relative">
            <div
              ref={editorRef}
              contentEditable
              onBlur={onBlur}
              onClick={onEditorClick}
              onKeyUp={saveSelection}
              onMouseUp={saveSelection}
              onKeyDown={onKeyDown}
              className="prose dark:prose-invert max-w-none min-h-[280px] p-3 rounded-md border focus:outline-none"
              suppressContentEditableWarning
            />
            {selectedImg && (
              <div
                ref={handleRef}
                onMouseDown={onHandleMouseDown}
                className="absolute h-4 w-4 rounded-full border border-primary bg-background cursor-se-resize shadow"
                style={{ zIndex: 10 }}
                aria-label="Resize image"
              />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
