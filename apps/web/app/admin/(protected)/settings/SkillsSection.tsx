"use client";

import * as React from "react";
import type { Level, Skill } from "@prisma/client";
import { MoreVertical, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

import { deleteSkill } from "@/server/skill/deleteSkill";
import { runMutationWithToast } from "@/lib/toast/mutationToast";
import { SkillForm } from "./SkillForm";

type SkillWithLevel = Skill & {
  level: Pick<Level, "id" | "name" | "levelOrder">;
};

export function SkillsSection({
  skills,
  levels,
}: {
  skills: SkillWithLevel[];
  levels: Level[];
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<SkillWithLevel | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const query = search.toLowerCase();
    return skills.filter((skill) =>
      [skill.name, skill.level.name, skill.description ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [skills, search]);

  const handleDelete = async (skill: SkillWithLevel) => {
    const ok = window.confirm(`Delete skill "${skill.name}"?`);
    if (!ok) return;

    setDeletingId(skill.id);
    try {
      await runMutationWithToast(
        () => deleteSkill(skill.id),
        {
          pending: { title: "Deleting skill..." },
          success: { title: "Skill deleted" },
          error: (message) => ({
            title: "Unable to delete skill",
            description: message,
          }),
          onSuccess: () => router.refresh(),
        }
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <div className="p-4 sm:flex sm:items-start sm:justify-between">
        <div className="sm:flex-auto">
          <h2 className="text-lg font-semibold">Skills</h2>
          <p className="mt-1 text-sm text-muted-foreground">Create level-specific skills for teacher checklists.</p>
        </div>
        <div className="mt-4 flex w-full items-center gap-3 sm:ml-16 sm:mt-0 sm:w-auto sm:flex-none">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search skills"
            className="w-full sm:w-64"
          />
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add skill
          </Button>
        </div>
      </div>

      <Card className="border-x-0! pb-0 shadow-none">
        <CardContent className="px-2 py-0">
          <div className="flow-root">
            <div className="-mx-4 -my-2 overflow-x-auto sm:mx-0 sm:overflow-x-visible">
              <div className="inline-block min-w-full py-2 align-middle sm:px-0">
                <table className="relative min-w-full table-fixed divide-y divide-border">
                  <thead>
                    <tr>
                      <th className="w-[25%] py-3 pl-4 pr-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Skill
                      </th>
                      <th className="w-[25%] px-3 py-3 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Level
                      </th>
                      <th className="w-[15%] px-3 py-3 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Order
                      </th>
                      <th className="w-[15%] px-3 py-3 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Active
                      </th>
                      <th className="w-[20%] py-3 pl-3 pr-4 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground sm:pr-0">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-border bg-card">
                    {filtered.map((skill) => (
                      <tr key={skill.id} className="transition-colors hover:bg-accent/40">
                        <td className="max-w-0 py-4 pl-4 pr-3 text-sm font-medium text-foreground">
                          <span className="block truncate" title={skill.name}>
                            {skill.name}
                          </span>
                          {skill.description ? (
                            <span className="mt-1 block truncate text-xs text-muted-foreground">
                              {skill.description}
                            </span>
                          ) : null}
                        </td>

                        <td className="max-w-0 px-3 py-4 text-center text-sm text-foreground">
                          <span className="block truncate">{skill.level.name}</span>
                        </td>

                        <td className="px-3 py-4 text-center text-sm text-foreground">{skill.sortOrder}</td>

                        <td className="px-3 py-4 text-center text-sm text-foreground">
                          {skill.active ? "Yes" : "No"}
                        </td>

                        <td className="py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>

                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditing(skill);
                                  setOpen(true);
                                }}
                              >
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(skill)}
                                disabled={deletingId === skill.id}
                                className="text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}

                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 pl-4 pr-3 text-sm text-muted-foreground">
                          No skills found.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <SkillForm
        open={open}
        skill={editing}
        levels={levels}
        onSaved={() => router.refresh()}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(null);
        }}
      />
    </div>
  );
}
