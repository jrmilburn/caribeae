"use client";

import * as React from "react";
import type { Level } from "@prisma/client";
import { MoreVertical, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

import { deleteLevel } from "@/server/level/deleteLevel";
import { LevelForm } from "./LevelForm";
import { runMutationWithToast } from "@/lib/toast/mutationToast";

export function LevelsSection({ levels }: { levels: Level[] }) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Level | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const query = search.toLowerCase();
    return levels
      .filter((level) => level.name.toLowerCase().includes(query))
      .sort((a, b) => a.levelOrder - b.levelOrder || a.name.localeCompare(b.name));
  }, [levels, search]);

  const handleDelete = async (level: Level) => {
    const ok = window.confirm(`Delete level "${level.name}"?`);
    if (!ok) return;

    setDeletingId(level.id);
    try {
      await runMutationWithToast(
        () => deleteLevel(level.id),
        {
          pending: { title: "Deleting level..." },
          success: { title: "Level deleted" },
          error: (message) => ({
            title: "Unable to delete level",
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
    <div className="">
      <div className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
        <div className="">
          <h2 className="text-lg font-semibold">Levels</h2>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add level
        </Button>
      </div>

      <Card className="border-l-0! shadow-none pb-0">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 px-4">
          <CardTitle className="text-base">Level list</CardTitle>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search levels"
            className="max-w-xs"
          />
        </CardHeader>

        <CardContent className="px-2 py-0">
          <div className="flow-root">
            <div className="-mx-4 -my-2 overflow-x-auto sm:mx-0 sm:overflow-x-visible">
              <div className="inline-block min-w-full py-2 align-middle sm:px-0">
                <table className="relative min-w-full table-fixed divide-y divide-border">
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="w-[20%] py-3 pr-3 pl-4 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                      >
                        Name
                      </th>
                      <th
                        scope="col"
                        className="w-[20%] px-3 py-3 text-center text-xs font-medium tracking-wide text-muted-foreground uppercase"
                      >
                        Order
                      </th>
                      <th
                        scope="col"
                        className="w-[20%] px-3 py-3 text-center text-xs font-medium tracking-wide text-muted-foreground uppercase"
                      >
                        Length
                      </th>
                      <th
                        scope="col"
                        className="w-[20%] px-3 py-3 text-center text-xs font-medium tracking-wide text-muted-foreground uppercase"
                      >
                        Capacity
                      </th>
                      <th
                        scope="col"
                        className="w-[20%] py-3 pr-4 pl-3 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase sm:pr-0"
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-border bg-card">
                    {filtered.map((level) => (
                      <tr key={level.id} className="transition-colors hover:bg-accent/40">
                        <td className="max-w-0 py-4 pr-3 pl-4 text-sm font-medium text-foreground">
                          <span className="block truncate" title={level.name}>
                            {level.name}
                          </span>
                        </td>
                        <td className="px-3 py-4 text-center text-sm text-foreground">{level.levelOrder}</td>
                        <td className="px-3 py-4 text-center text-sm text-foreground">
                          {level.defaultLengthMin} min
                        </td>
                        <td className="px-3 py-4 text-center text-sm text-foreground">
                          {typeof level.defaultCapacity === "number"
                            ? level.defaultCapacity
                            : "—"}
                        </td>

                        <td className="py-4 pr-4 pl-3 text-right text-sm font-medium sm:pr-0">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>

                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditing(level);
                                  setOpen(true);
                                }}
                              >
                                Edit
                              </DropdownMenuItem>

                              <DropdownMenuSeparator />

                              <DropdownMenuItem
                                onClick={() => handleDelete(level)}
                                disabled={deletingId === level.id}
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
                        <td colSpan={5} className="py-6 pr-3 pl-4 text-sm text-muted-foreground">
                          No levels found.
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

      <LevelForm
        open={open}
        level={editing}
        onSaved={() => router.refresh()}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(null);
        }}
      />
    </div>
  );
}
