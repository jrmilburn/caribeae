"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { EnrolmentStartPageData } from "@/server/enrolment/getEnrolmentStartPageData";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

type Props = {
  data: EnrolmentStartPageData;
};

export default function EnrolmentStartForm({ data }: Props) {
  const router = useRouter();

  const defaultStart = useMemo(() => getTodayInMelbourne(), []);
  const [studentId, setStudentId] = useState(data.students[0]?.id ?? "");
  const [templateId, setTemplateId] = useState(data.templates[0]?.id ?? "");
  const [startDate, setStartDate] = useState(defaultStart);

  const hasStudents = data.students.length > 0;
  const hasTemplates = data.templates.length > 0;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!studentId || !templateId) return;

    const params = new URLSearchParams({
      studentId,
      templateId,
    });

    if (startDate) {
      params.set("startDate", startDate);
    }

    router.push(`/admin/enrolment/new?${params.toString()}`);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border bg-card p-4 shadow-sm">
      <div className="grid gap-5">
        <div className="space-y-2">
          <Label htmlFor="student">Student</Label>
          <Select value={studentId} onValueChange={setStudentId} disabled={!hasStudents}>
            <SelectTrigger id="student" className="w-full justify-between">
              <SelectValue placeholder="Select student" />
            </SelectTrigger>
            <SelectContent>
              {data.students.map((student) => (
                <SelectItem key={student.id} value={student.id}>
                  <div className="flex flex-col">
                    <span>{student.name}</span>
                    {student.familyName ? (
                      <span className="text-xs text-muted-foreground">{student.familyName}</span>
                    ) : null}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!hasStudents ? (
            <p className="text-xs text-muted-foreground">Add a student before creating enrolments.</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="template">Class template</Label>
          <Select value={templateId} onValueChange={setTemplateId} disabled={!hasTemplates}>
            <SelectTrigger id="template" className="w-full justify-between">
              <SelectValue placeholder="Select class template" />
            </SelectTrigger>
            <SelectContent>
              {data.templates.map((template) => {
                const name = template.name?.trim() || "Untitled";
                return (
                  <SelectItem key={template.id} value={template.id}>
                    <div className="flex flex-col">
                      <span>{name}</span>
                      <span className="text-xs text-muted-foreground">
                        {template.levelName} • {template.schedule}
                      </span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {!hasTemplates ? (
            <p className="text-xs text-muted-foreground">Create a class template first.</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="startDate">Start date</Label>
          <Input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            maxLength={10}
            pattern="\\d{4}-\\d{2}-\\d{2}"
          />
          <p className="text-xs text-muted-foreground">Defaults to today (Australia/Melbourne).</p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="submit"
          disabled={!studentId || !templateId || !hasStudents || !hasTemplates}
        >
          Continue
        </Button>
      </div>
    </form>
  );
}

function getTodayInMelbourne() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}
