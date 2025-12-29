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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { deleteLevel } from "@/server/level/deleteLevel";
import { LevelForm } from "./LevelForm";

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
      await deleteLevel(level.id);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to delete level.";
      window.alert(message);
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
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No levels found.</p>
          ) : (
            <div className="">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[20%] text-left">Name</TableHead>
                    <TableHead className="w-[20%] text-center">Order</TableHead>
                    <TableHead className="w-[20%] text-center">Length</TableHead>
                    <TableHead className="w-[20%] text-center">Capacity</TableHead>
                    <TableHead className="w-[20%] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filtered.map((level) => (
                    <TableRow key={level.id}>
                      <TableCell className="font-medium w-[20%] text-left">{level.name}</TableCell>
                      <TableCell className="w-[20%] text-center">{level.levelOrder}</TableCell>
                      <TableCell className="w-[20%] text-center">{level.defaultLengthMin} min</TableCell>
                      <TableCell className="w-[20%] text-center">
                        {typeof level.defaultCapacity === "number"
                          ? level.defaultCapacity
                          : "—"}
                      </TableCell>

                      <TableCell className="text-right w-[20%]">
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
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
