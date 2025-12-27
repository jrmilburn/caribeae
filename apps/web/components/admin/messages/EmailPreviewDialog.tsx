"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Renders a realistic email preview in a modal.
 * Uses an <iframe srcDoc> with a 600px email-safe wrapper.
 */
export default function EmailPreviewDialog({
  open,
  onOpenChange,
  html,
  subject,
  fromName,
  fromEmail,
  preheader,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  html: string;
  subject: string;
  fromName?: string;
  fromEmail?: string;
  preheader?: string;
}) {
  const doc = React.useMemo(() => {
    const pre = preheader
      ? `<div style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${escapeHtml(
          preheader
        )}</div>`
      : "";

    // Very light “email client” shell with 600px table container
    const shell = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width" />
<title>${escapeHtml(subject || "Preview")}</title>
<style>
  /* generic reset */
  img{border:0; line-height:100%; outline:none; text-decoration:none;}
  table{border-collapse:collapse !important;}
  body{margin:0!important; padding:0!important; background:#f5f5f5;}
  .container{width:100%; padding:24px 0;}
  .email{width:100%; max-width:600px; margin:0 auto; background:#ffffff;}
  .email-body{padding:24px; font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,Helvetica,Arial,sans-serif; color:#0f172a; line-height:1.5;}
  .meta{font:12px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Inter,Helvetica,Arial,sans-serif; color:#64748b; padding:12px 24px;}
</style>
</head>
<body>
  <div class="container">
    <table role="presentation" class="email" cellpadding="0" cellspacing="0" width="100%">
      <tr><td class="meta">
        <div><strong>From:</strong> ${escapeHtml(fromName || "")}${fromEmail ? ` &lt;${escapeHtml(fromEmail)}&gt;` : ""}</div>
        <div><strong>Subject:</strong> ${escapeHtml(subject || "")}</div>
      </td></tr>
      <tr><td class="email-body">
        ${pre}${html}
      </td></tr>
    </table>
  </div>
</body>
</html>`;
    return shell;
  }, [html, subject, fromEmail, fromName, preheader]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[92vw] h-[80vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>Email preview</DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-4 flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            Print
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const w = window.open("", "_blank");
              if (!w) return;
              w.document.open();
              w.document.write(doc);
              w.document.close();
            }}
          >
            Open in new tab
          </Button>
        </div>

        <div className="h-[calc(80vh-112px)]">
          <iframe
            title="email-preview"
            className="w-full h-full"
            sandbox=""
            srcDoc={doc}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]!));
}
