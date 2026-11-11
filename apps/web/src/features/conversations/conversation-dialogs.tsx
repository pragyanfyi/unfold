import { useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { StorageError } from "#/features/storage/store";
import { type ConversationRecord, MAX_TITLE_LENGTH } from "#/features/storage/types";
import { useDeleteConversation, useRenameConversation } from "./mutations";

export function RenameDialog({
  record,
  onClose,
}: {
  record: ConversationRecord | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={record !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {/* Remounted per conversation so the field starts from its current title. */}
        {record ? <RenameForm key={record.id} record={record} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({ record, onClose }: { record: ConversationRecord; onClose: () => void }) {
  const [title, setTitle] = useState(record.title);
  const rename = useRenameConversation();
  const trimmed = title.trim();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!trimmed) return;
    rename.mutate(
      { record, title: trimmed },
      {
        onSuccess: onClose,
        onError: (error) => {
          toast.error(
            error instanceof StorageError && error.code === "conflict"
              ? "This conversation was renamed in another tab. Check the list and try again."
              : "Could not rename the conversation.",
          );
          onClose();
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Rename idea</DialogTitle>
        <DialogDescription>
          Only the name changes. The conversation stays as it is.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor="conversation-title">Name</Label>
        <Input
          id="conversation-title"
          value={title}
          maxLength={MAX_TITLE_LENGTH}
          onChange={(event) => setTitle(event.target.value)}
          autoFocus
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!trimmed || rename.isPending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DeleteDialog({
  record,
  onClose,
  onDeleted,
}: {
  record: ConversationRecord | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const remove = useDeleteConversation();
  return (
    <Dialog open={record !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this idea?</DialogTitle>
          <DialogDescription>
            “{record?.title}” and its whole conversation are removed from this browser. This cannot
            be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => {
              if (!record) return;
              remove.mutate(record.id, {
                onSuccess: () => {
                  onDeleted(record.id);
                  onClose();
                },
                onError: () => toast.error("Could not delete the conversation."),
              });
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
