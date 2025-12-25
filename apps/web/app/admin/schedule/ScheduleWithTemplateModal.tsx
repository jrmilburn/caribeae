"use client";

import { useState } from "react";
import type { Level } from "@prisma/client";
import { useRouter } from "next/navigation";

import { ScheduleView } from "@/packages/schedule";
import { TemplateModal } from "../class/templates/TemplateModal";
import { createTemplate } from "@/server/classTemplate/createTemplate";
import type { ClientTemplate } from "@/server/classTemplate/types";

export default function ScheduleWithTemplateModal({ levels }: { levels: Level[] }) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ date: Date; startMinutes: number } | null>(null);

  const handleSlotClick = (date: Date) => {
    const minutes = date.getHours() * 60 + date.getMinutes();
    setPrefill({ date, startMinutes: minutes });
    setModalOpen(true);
  };

  const handleSave = async (payload: ClientTemplate) => {
    await createTemplate(payload);
    setModalOpen(false);
    router.refresh();
  };

  return (
    <>
      <ScheduleView
        levels={levels}
        dataEndpoint="/api/admin/class-templates"
        onSlotClick={handleSlotClick}
      />

      <TemplateModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        template={null}
        levels={levels}
        onSave={handleSave}
        prefill={prefill ? { date: prefill.date, startMinutes: prefill.startMinutes } : undefined}
      />
    </>
  );
}
