import { useState } from "react";
import { actions } from "astro:actions";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { InvitationRow } from "@/lib/services/invitations";

interface Props {
  invitations: InvitationRow[];
  onRevoked: (id: string) => void;
}

export default function PendingInvitations({ invitations, onRevoked }: Props) {
  const [revokeTarget, setRevokeTarget] = useState<InvitationRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Optimistically hide a row while its revoke is in flight; reveal on error.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const visible = invitations.filter((inv) => !hiddenIds.has(inv.id));
  if (visible.length === 0) return null;

  async function handleConfirm(e: React.MouseEvent<HTMLButtonElement>) {
    if (!revokeTarget) return;
    e.preventDefault();
    const removed = revokeTarget;
    setSubmitting(true);
    setHiddenIds((prev) => new Set(prev).add(removed.id));

    const { error } = await actions.invitations.revoke({ invitationId: removed.id });
    setSubmitting(false);
    setRevokeTarget(null);

    if (error) {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(removed.id);
        return next;
      });
      toast.error(error.message || "Could not revoke invitation");
      return;
    }
    onRevoked(removed.id);
    toast.success("Invitation revoked");
  }

  return (
    <section className="space-y-3">
      <h2 className="text-muted-foreground text-sm font-medium">Invitations</h2>
      <ul className="divide-border divide-y rounded-md border">
        {visible.map((inv) => {
          const accepted = inv.accepted_at !== null;
          return (
            <li key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm">{inv.email}</span>
                <Badge variant={accepted ? "secondary" : "outline"}>{accepted ? "Accepted" : "Pending"}</Badge>
              </div>
              {!accepted && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRevokeTarget(inv);
                  }}
                >
                  Revoke
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke invitation to {revokeTarget?.email ?? "this address"}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will no longer be able to accept this invitation. You can invite them again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={submitting} onClick={handleConfirm}>
              {submitting ? "Revoking…" : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
