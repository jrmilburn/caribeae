"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { TeacherHistoryFeed } from "@/components/teacher/TeacherHistoryFeed";
import { runMutationWithToast } from "@/lib/toast/mutationToast";
import { setTeacherStudentSkillMastery } from "@/server/teacher/actions";
import type {
  TeacherStudentHistoryItem,
  TeacherStudentSkillItem,
} from "@/server/teacher/getTeacherStudentDetails";

type TeacherStudentPageClientProps = {
  studentId: string;
  skills: TeacherStudentSkillItem[];
  history: TeacherStudentHistoryItem[];
};

export default function TeacherStudentPageClient({
  studentId,
  skills: initialSkills,
  history,
}: TeacherStudentPageClientProps) {
  const [skills, setSkills] = React.useState(initialSkills);
  const [loadingSkillId, setLoadingSkillId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSkills(initialSkills);
  }, [initialSkills]);

  const handleToggle = async (skillId: string, mastered: boolean) => {
    setLoadingSkillId(skillId);

    try {
      await runMutationWithToast(
        () =>
          setTeacherStudentSkillMastery({
            studentId,
            skillId,
            mastered,
          }),
        {
          pending: { title: "Saving skill..." },
          success: { title: "Skill updated" },
          error: (message) => ({
            title: "Unable to update skill",
            description: message,
          }),
          onSuccess: (result) => {
            setSkills((prev) =>
              prev.map((skill) =>
                skill.skillId === result.skillId
                  ? {
                      ...skill,
                      mastered: result.mastered,
                      masteredAt: result.masteredAt,
                    }
                  : skill
              )
            );
          },
        }
      );
    } finally {
      setLoadingSkillId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Skill progression</h2>
          <p className="mt-1 text-xs text-gray-500">
            Mark skills as mastered for the student&apos;s current level.
          </p>
        </div>

        <div className="divide-y divide-gray-100">
          {skills.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-500">No skills configured for this level yet.</div>
          ) : (
            skills.map((skill) => {
              const loading = loadingSkillId === skill.skillId;
              return (
                <label
                  key={skill.skillId}
                  className="flex cursor-pointer items-start gap-3 px-4 py-3"
                >
                  <span className="pt-0.5">
                    <Checkbox
                      checked={skill.mastered}
                      onCheckedChange={(checked) => {
                        if (loading) return;
                        handleToggle(skill.skillId, checked === true);
                      }}
                      disabled={loading}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-900">{skill.name}</span>
                    {skill.description ? (
                      <span className="mt-1 block text-xs text-gray-500">{skill.description}</span>
                    ) : null}
                  </span>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : null}
                </label>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white px-4 py-4">
        <h2 className="text-sm font-semibold text-gray-900">History</h2>
        <p className="mt-1 text-xs text-gray-500">Recent skill checks and class or enrolment activity.</p>
        <div className="mt-4">
          <TeacherHistoryFeed items={history} />
        </div>
      </section>
    </div>
  );
}
