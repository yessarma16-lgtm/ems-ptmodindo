"use client";

import { useState, type FormEvent } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ExportTemplateSheetWithColumns } from "@/lib/export-template-service";

interface SheetTabBarProps {
  sheets: ExportTemplateSheetWithColumns[];
  activeSheetId: string | null;
  onSelectSheet: (sheetId: string) => void;
  onAddSheet: (name: string) => Promise<boolean>;
  onRenameSheet: (sheetId: string, name: string) => Promise<boolean>;
  onDeleteSheet: (sheetId: string) => Promise<boolean>;
  onReorderSheets: (orderedIds: string[]) => void;
}

export function SheetTabBar({
  sheets,
  activeSheetId,
  onSelectSheet,
  onAddSheet,
  onRenameSheet,
  onDeleteSheet,
  onReorderSheets,
}: SheetTabBarProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [renaming, setRenaming] = useState<ExportTemplateSheetWithColumns | null>(null);
  const [deleting, setDeleting] = useState<ExportTemplateSheetWithColumns | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sheets.findIndex((s) => s.id === active.id);
    const newIndex = sheets.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorderSheets(arrayMove(sheets, oldIndex, newIndex).map((s) => s.id));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sheets.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
          <div className="flex flex-wrap items-center gap-2">
            {sheets.map((sheet) => (
              <SortableSheetTab
                key={sheet.id}
                sheet={sheet}
                active={sheet.id === activeSheetId}
                onSelect={() => onSelectSheet(sheet.id)}
                onRename={() => setRenaming(sheet)}
                onDelete={() => setDeleting(sheet)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(true)}>
        <Plus />
        Add Sheet
      </Button>

      <AddSheetDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSubmit={async (name) => {
          const ok = await onAddSheet(name);
          if (ok) setAddOpen(false);
          return ok;
        }}
      />

      <RenameSheetDialog
        key={renaming?.id ?? "none"}
        sheet={renaming}
        onOpenChange={(open) => !open && setRenaming(null)}
        onSubmit={async (name) => {
          if (!renaming) return false;
          const ok = await onRenameSheet(renaming.id, name);
          if (ok) setRenaming(null);
          return ok;
        }}
      />

      <DeleteSheetDialog
        sheet={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          const ok = await onDeleteSheet(deleting.id);
          if (ok) setDeleting(null);
        }}
      />
    </div>
  );
}

function SortableSheetTab({
  sheet,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  sheet: ExportTemplateSheetWithColumns;
  active: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sheet.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-1 rounded-lg border px-1 py-1 pl-1.5",
        active ? "border-primary bg-primary/5" : "border-border bg-card",
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder sheet"
      >
        <GripVertical className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className={cn("px-1.5 py-1 text-sm font-medium", active ? "text-primary" : "text-foreground")}
      >
        {sheet.name}
      </button>
      <button
        type="button"
        onClick={onRename}
        className="rounded p-1 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100"
        title="Rename sheet"
      >
        <Pencil className="size-3" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="rounded p-1 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        title="Delete sheet"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}

function AddSheetDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Sheet name is required.");
      return;
    }
    setSubmitting(true);
    const ok = await onSubmit(name.trim());
    setSubmitting(false);
    if (ok) setName("");
    else setError("A sheet with this name already exists in this template.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Sheet</DialogTitle>
          <DialogDescription>Sheet names must be unique within this template.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="new-sheet-name" className="mb-1.5 block">
              Sheet Name
            </Label>
            <Input
              id="new-sheet-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="e.g. BPJS"
              autoFocus
            />
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameSheetDialog({
  sheet,
  onOpenChange,
  onSubmit,
}: {
  sheet: ExportTemplateSheetWithColumns | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(sheet?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Sheet name is required.");
      return;
    }
    setSubmitting(true);
    const ok = await onSubmit(name.trim());
    setSubmitting(false);
    if (!ok) setError("A sheet with this name already exists in this template.");
  }

  return (
    <Dialog open={!!sheet} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename Sheet</DialogTitle>
          <DialogDescription>Columns inside this sheet are not affected.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="rename-sheet-name" className="mb-1.5 block">
              Sheet Name
            </Label>
            <Input
              id="rename-sheet-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              autoFocus
            />
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteSheetDialog({
  sheet,
  onOpenChange,
  onConfirm,
}: {
  sheet: ExportTemplateSheetWithColumns | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <Dialog open={!!sheet} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete sheet &quot;{sheet?.name}&quot;?</DialogTitle>
          <DialogDescription>
            All column configuration inside this sheet will be removed. The rest of the template is not
            affected. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              await onConfirm();
              setSubmitting(false);
            }}
          >
            Delete Sheet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
