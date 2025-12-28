"use client";

import * as React from "react";
import type { Level } from "@prisma/client";
import { Edit, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center p-4">
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

      <Card className="border-l-0!">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Level list</CardTitle>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search levels"
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No levels found.</p>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Length</TableHead>
                    <TableHead>Capacity</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((level) => (
                    <TableRow key={level.id}>
                      <TableCell className="font-medium">{level.name}</TableCell>
                      <TableCell>{level.levelOrder}</TableCell>
                      <TableCell>{level.defaultLengthMin} min</TableCell>
                      <TableCell>
                        {typeof level.defaultCapacity === "number"
                          ? level.defaultCapacity
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setEditing(level);
                              setOpen(true);
                            }}
                            aria-label={`Edit ${level.name}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => handleDelete(level)}
                            disabled={deletingId === level.id}
                            aria-label={`Delete ${level.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
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
