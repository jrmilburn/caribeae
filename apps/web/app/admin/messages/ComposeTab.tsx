"use client";

import * as React from "react";
import type { Family, Level, InvoiceStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { previewBroadcastRecipientsAction, sendBroadcastAction, sendDirectMessageAction } from "@/server/messages/workflows";

type ComposeTabProps = {
  families: Family[];
  levels: Level[];
  invoiceStatuses: InvoiceStatus[];
};

type Channel = "SMS" | "EMAIL";

export function ComposeTab({ families, levels, invoiceStatuses }: ComposeTabProps) {
  const [familyId, setFamilyId] = React.useState("");
  const [channel, setChannel] = React.useState<Channel>("SMS");
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [directStatus, setDirectStatus] = React.useState<string | null>(null);
  const [directBusy, startDirect] = React.useTransition();

  const [broadcastChannel, setBroadcastChannel] = React.useState<Channel>("SMS");
  const [broadcastMessage, setBroadcastMessage] = React.useState("");
  const [broadcastSubject, setBroadcastSubject] = React.useState("");
  const [selectedLevels, setSelectedLevels] = React.useState<Set<string>>(new Set());
  const [selectedInvoiceStatuses, setSelectedInvoiceStatuses] = React.useState<Set<InvoiceStatus>>(new Set());
  const [activeOnly, setActiveOnly] = React.useState(false);
  const [preview, setPreview] = React.useState<{ recipients: { familyId: string; familyName: string; destination: string | null }[]; skipped: { familyId: string; familyName: string; destination: string | null }[] } | null>(null);
  const [broadcastStatus, setBroadcastStatus] = React.useState<string | null>(null);
  const [broadcastBusy, startBroadcast] = React.useTransition();

  const toggleLevel = (id: string) => {
    setSelectedLevels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleInvoiceStatus = (status: InvoiceStatus) => {
    setSelectedInvoiceStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const handleDirectSend = () => {
    startDirect(async () => {
      setDirectStatus(null);
      const res = await sendDirectMessageAction({
        familyId,
        channel,
        body: message,
        subject: subject || undefined,
      });
      if (res.ok) {
        setDirectStatus("Message sent");
        setMessage("");
      } else {
        setDirectStatus(res.error ?? "Failed to send");
      }
    });
  };

  const previewBroadcast = () => {
    startBroadcast(async () => {
      const res = await previewBroadcastRecipientsAction({
        channel: broadcastChannel,
        filters: {
          levelIds: Array.from(selectedLevels),
          invoiceStatuses: Array.from(selectedInvoiceStatuses),
          activeEnrolments: activeOnly,
        },
      });
      setPreview(res);
      setBroadcastStatus(null);
    });
  };

  const sendBroadcast = () => {
    startBroadcast(async () => {
      setBroadcastStatus(null);
      const res = await sendBroadcastAction({
        channel: broadcastChannel,
        body: broadcastMessage,
        subject: broadcastSubject || undefined,
        filters: {
          levelIds: Array.from(selectedLevels),
          invoiceStatuses: Array.from(selectedInvoiceStatuses),
          activeEnrolments: activeOnly,
        },
      });
      if ("ok" in res && res.ok) {
        setBroadcastStatus("Broadcast sent");
        setBroadcastMessage("");
        setPreview(null);
      } else {
        setBroadcastStatus((res as any).error ?? "Failed to send");
      }
    });
  };

  return (
    <div className="space-y-8">
      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Direct message</div>
            <p className="text-xs text-muted-foreground">Send a single message to a family.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <Label className="text-xs">Family</Label>
            <select
              className="h-10 w-full rounded-md border px-2 text-sm"
              value={familyId}
              onChange={(e) => setFamilyId(e.target.value)}
            >
              <option value="">Select family…</option>
              {families.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <Label className="text-xs">Channel</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={channel === "SMS" ? "default" : "outline"}
                onClick={() => setChannel("SMS")}
              >
                SMS
              </Button>
              <Button
                type="button"
                variant={channel === "EMAIL" ? "default" : "outline"}
                onClick={() => setChannel("EMAIL")}
              >
                Email
              </Button>
            </div>
          </div>
        </div>

        {channel === "EMAIL" && (
          <div className="mt-3">
            <Label className="text-xs">Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1" />
          </div>
        )}

        <div className="mt-3">
          <Label className="text-xs">Message</Label>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} className="mt-1" rows={4} />
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>{message.length} characters</span>
            <Button
              type="button"
              onClick={handleDirectSend}
              disabled={!familyId || !message.trim() || directBusy}
            >
              {directBusy ? "Sending…" : "Send"}
            </Button>
          </div>
          {directStatus && <div className="mt-2 text-xs text-muted-foreground">{directStatus}</div>}
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Broadcast</div>
            <p className="text-xs text-muted-foreground">Send one message to multiple families.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label className="text-xs">Channel</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={broadcastChannel === "SMS" ? "default" : "outline"}
                onClick={() => setBroadcastChannel("SMS")}
              >
                SMS
              </Button>
              <Button
                type="button"
                variant={broadcastChannel === "EMAIL" ? "default" : "outline"}
                onClick={() => setBroadcastChannel("EMAIL")}
              >
                Email
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Levels</Label>
            <div className="flex flex-wrap gap-2">
              {levels.map((lvl) => (
                <Badge
                  key={lvl.id}
                  variant={selectedLevels.has(lvl.id) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleLevel(lvl.id)}
                >
                  {lvl.name}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Invoice status</Label>
            <div className="flex flex-wrap gap-2">
              {invoiceStatuses.map((st) => (
                <Badge
                  key={st}
                  variant={selectedInvoiceStatuses.has(st) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleInvoiceStatus(st)}
                >
                  {st}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 text-sm">
          <input
            id="activeOnly"
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
            className="h-4 w-4"
          />
          <Label htmlFor="activeOnly" className="text-xs">
            Only families with active enrolments
          </Label>
        </div>

        {broadcastChannel === "EMAIL" && (
          <div className="mt-3">
            <Label className="text-xs">Subject</Label>
            <Input value={broadcastSubject} onChange={(e) => setBroadcastSubject(e.target.value)} className="mt-1" />
          </div>
        )}

        <div className="mt-3">
          <Label className="text-xs">Message</Label>
          <Textarea
            value={broadcastMessage}
            onChange={(e) => setBroadcastMessage(e.target.value)}
            className="mt-1"
            rows={4}
          />
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>{broadcastMessage.length} characters</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={previewBroadcast} disabled={broadcastBusy}>
                {broadcastBusy ? "Loading…" : "Preview recipients"}
              </Button>
              <Button
                type="button"
                onClick={sendBroadcast}
                disabled={!broadcastMessage.trim() || broadcastBusy}
              >
                {broadcastBusy ? "Sending…" : "Send broadcast"}
              </Button>
            </div>
          </div>
          {broadcastStatus && <div className="mt-2 text-xs text-muted-foreground">{broadcastStatus}</div>}
        </div>

        {preview && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-sm font-semibold">Recipients ({preview.recipients.length})</div>
              <div className="mt-2 max-h-48 overflow-y-auto rounded-md border p-2 text-xs">
                {preview.recipients.map((r) => (
                  <div key={r.familyId} className="border-b py-1 last:border-0">
                    <div className="font-medium">{r.familyName}</div>
                    <div className="text-muted-foreground">{r.destination}</div>
                  </div>
                ))}
                {preview.recipients.length === 0 && <div className="text-muted-foreground">No recipients.</div>}
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold">Skipped ({preview.skipped.length})</div>
              <div className="mt-2 max-h-48 overflow-y-auto rounded-md border p-2 text-xs">
                {preview.skipped.map((r) => (
                  <div key={r.familyId} className="border-b py-1 last:border-0">
                    <div className="font-medium">{r.familyName}</div>
                    <div className="text-muted-foreground">Missing contact info</div>
                  </div>
                ))}
                {preview.skipped.length === 0 && <div className="text-muted-foreground">None skipped.</div>}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
