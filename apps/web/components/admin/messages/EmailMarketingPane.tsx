"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import EmailEditor from "./EmailEditor";
import { toast } from "sonner";
import { sendEmailBroadcastAction } from "@/lib/server/messages/sendEmailBroadcast";
import type { ClientRecipient } from "@/types/admin/recipients";
import { Mail } from "lucide-react";
import EmailPreviewDialog from "./EmailPreviewDialog";

export default function EmailMarketingPane({
  selectedClients,
}: {
  selectedClients: ClientRecipient[];
}) {
  const [subject, setSubject] = React.useState("");
  const [preheader, setPreheader] = React.useState("");
  const [html, setHtml] = React.useState("<p>Write your update…</p>");
  const [sending, setSending] = React.useState(false);
  const [showPreview, setShowPreview] = React.useState(true);

  const onChange = (v: { subject: string; preheader?: string; html: string }) => {
    setSubject(v.subject);
    setPreheader(v.preheader || "");
    setHtml(v.html);
  };

  const recipients = React.useMemo(() => {
    const out = new Map<string, { email: string; name?: string }>();
    for (const c of selectedClients) {
      for (const e of c.emails) {
        const key = e.trim().toLowerCase();
        if (!key) continue;
        if (!out.has(key)) out.set(key, { email: key, name: c.name });
      }
    }
    return Array.from(out.values());
  }, [selectedClients]);

  const send = async () => {
    if (!recipients.length) {
      toast.error("No email recipients selected");
      return;
    }
    if (!subject.trim()) {
      toast.error("Subject is required");
      return;
    }
    if (!html.trim()) {
      toast.error("Email body is empty");
      return;
    }

    setSending(true);
    try {
      const res = await sendEmailBroadcastAction({
        subject,
        preheader,
        html,
        recipients,
        meta: { selectedCount: selectedClients.length },
      });
      if (!res.ok) {
        toast.error(res.error || "Failed to send");
        return;
      }

      if(res.summary === undefined) {
        return
      }

      const { total, sent, failed } = res.summary;
      toast.success("Email dispatched", { description: `${sent}/${total} sent, ${failed} failed` });
    } catch (e) {
      console.error(e);
      toast.error("Failed to send");
    } finally {
      setSending(false);
    }
  };

  const [openPreview, setOpenPreview] = React.useState(false);

  // Optional: pull from env or your org profile
  const FROM_NAME = "Studio Parallel";
  const FROM_EMAIL = process.env.NEXT_PUBLIC_FROM_EMAIL ?? "no-reply@studioparallel.au";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="capitalize">
            <Mail className="mr-1 h-3.5 w-3.5" /> {recipients.length} recipient{recipients.length === 1 ? "" : "s"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpenPreview(true)}>
            Preview
          </Button>
          <Button variant={showPreview ? "secondary" : "outline"} size="sm" onClick={() => setShowPreview(v => !v)}>
            {showPreview ? "Hide inline" : "Show inline"}
          </Button>
          <Button onClick={send} disabled={sending || !recipients.length || !subject.trim() || !html.trim()}>
            {sending ? "Sending…" : "Send email"}
          </Button>
        </div>
      </div>

      <EmailEditor subject={subject} preheader={preheader} initialHtml={html} onChange={onChange} />

      {showPreview && (
        <Card>
          <CardHeader><CardTitle>Inline preview</CardTitle></CardHeader>
          <CardContent>
            <div className="border rounded-lg p-4 overflow-auto bg-background">
              <div dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          </CardContent>
        </Card>
      )}

      <EmailPreviewDialog
        open={openPreview}
        onOpenChange={setOpenPreview}
        html={html}
        subject={subject}
        preheader={preheader}
        fromName={FROM_NAME}
        fromEmail={FROM_EMAIL}
      />
    </div>
  );
}
