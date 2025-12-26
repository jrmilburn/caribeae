"use client";

import { useState } from "react";
import type { ClassTemplate, Level, Teacher } from "@prisma/client";
import { useRouter } from "next/navigation";

import { ScheduleView } from "@/packages/schedule";
import { TemplateModal } from "../class/templates/TemplateModal";
import { createTemplate } from "@/server/classTemplate/createTemplate";
import { updateTemplate } from "@/server/classTemplate/updateTemplate";
import type { ClientTemplate } from "@/server/classTemplate/types";
import type { NormalizedScheduleClass } from "@/packages/schedule";

export default function ScheduleWithTemplateModal({ levels, teachers }: { levels: Level[]; teachers: Teacher[] }) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ClassTemplate | null>(null);
  const [prefill, setPrefill] = useState<{
    date: Date;
    startMinutes: number;
    levelId?: string;
    teacherId?: string;
  } | null>(null);

  const handleSlotClick = (date: Date) => {
    const minutes = date.getHours() * 60 + date.getMinutes();
    setSelectedTemplate(null);
    setPrefill({ date, startMinutes: minutes });
    setModalOpen(true);
  };

  const handleClassClick = (occurrence: NormalizedScheduleClass) => {
    if (!occurrence.template) return;
    setSelectedTemplate(occurrence.template);
    const minutes = occurrence.startTime.getHours() * 60 + occurrence.startTime.getMinutes();
    setPrefill({
      date: occurrence.startTime,
      startMinutes: minutes,
      levelId: occurrence.levelId ?? undefined,
      teacherId: occurrence.teacherId ?? undefined,
    });
    setModalOpen(true);
  };

  const handleSave = async (payload: ClientTemplate) => {
    if (selectedTemplate) {
      await updateTemplate(payload, selectedTemplate.id);
    } else {
      await createTemplate(payload);
    }
    setModalOpen(false);
    setSelectedTemplate(null);
    router.refresh();
  };

  return (
    <>
      <ScheduleView
        levels={levels}
        dataEndpoint="/api/admin/class-templates"
        onSlotClick={handleSlotClick}
        onClassClick={handleClassClick}
      />

      <TemplateModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setSelectedTemplate(null);
        }}
        template={selectedTemplate}
        levels={levels}
        teachers={teachers}
        onSave={handleSave}
        prefill={
          prefill
            ? {
                date: prefill.date,
                startMinutes: prefill.startMinutes,
                levelId: prefill.levelId,
                teacherId: prefill.teacherId,
              }
            : undefined
        }
      />
    </>
  );
}
