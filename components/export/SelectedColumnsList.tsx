"use client";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, KeyRound, Minus, Pencil, Type, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getFieldByKey } from "@/config/employee-fields";
import type { ExportTemplateColumn } from "@/lib/export-template-service";

interface SelectedColumnsListProps {
  columns: ExportTemplateColumn[];
  onReorder: (orderedIds: string[]) => void;
  onRemove: (columnId: string) => void;
  onEdit: (column: ExportTemplateColumn) => void;
}

export function SelectedColumnsList({ columns, onReorder, onRemove, onEdit }: SelectedColumnsListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = columns.findIndex((c) => c.id === active.id);
    const newIndex = columns.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(columns, oldIndex, newIndex).map((c) => c.id));
  }

  if (columns.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
        No columns yet. Pick a field on the left, or add a blank column.
      </p>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={columns.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-1.5">
          {columns.map((column, idx) => (
            <SortableColumnRow
              key={column.id}
              index={idx + 1}
              column={column}
              onRemove={() => onRemove(column.id)}
              onEdit={() => onEdit(column)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableColumnRow({
  index,
  column,
  onRemove,
  onEdit,
}: {
  index: number;
  column: ExportTemplateColumn;
  onRemove: () => void;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isBlank = column.columnType === "BLANK";
  const isStatic = column.columnType === "STATIC";
  const field = column.sourceField ? getFieldByKey(column.sourceField) : undefined;
  const label = column.displayLabel?.trim() || field?.label || column.sourceField || (isBlank ? "Blank column" : "Custom column");

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-2"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical className="size-4" />
      </button>
      <span className="w-6 shrink-0 text-right text-xs text-muted-foreground">{index}.</span>
      <div className="flex flex-1 items-center gap-2 overflow-hidden">
        {isBlank ? (
          <span className="flex items-center gap-1.5 text-sm italic text-muted-foreground">
            <Minus className="size-3.5" />
            Blank column
          </span>
        ) : isStatic ? (
          <span className="flex min-w-0 items-center gap-1.5 text-sm">
            <Type className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{label}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              = {column.blankValue ? `"${column.blankValue}"` : <em>empty</em>}
            </span>
          </span>
        ) : (
          <span className="truncate text-sm font-medium">{label}</span>
        )}
        {column.isKey && (
          <Badge variant="outline" className="gap-1 text-xs">
            <KeyRound className="size-3" />
            Key
          </Badge>
        )}
        <Badge variant={isBlank || isStatic ? "secondary" : "default"} className="ml-auto text-xs">
          {isBlank ? "BLANK" : isStatic ? "STATIC" : "Employee"}
        </Badge>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={onEdit}
        title="Rename column"
      >
        <Pencil className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        title="Remove column"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
