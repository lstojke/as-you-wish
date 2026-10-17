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
import { useT } from "@/components/hooks/useT";

interface Props {
  invitations: InvitationRow[];
  onRevoked: (id: string) => void;
}

export default function PendingInvitations({ invitations, onRevoked }: Props) {
  const { t } = useT();
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
      toast.error(error.message || t("errors.inviteRevoke"));
      return;
    }
    onRevoked(removed.id);
    toast.success(t("invite.revoked"));
  }

  return (
    <section className="space-y-3">
      <h2 className="text-muted-foreground text-sm font-medium">{t("invite.invitations")}</h2>
      <ul className="divide-border divide-y rounded-md border">
        {visible.map((inv) => {
          const accepted = inv.accepted_at !== null;
          return (
            <li key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm">{inv.email}</span>
                <Badge variant={accepted ? "secondary" : "outline"}>
                  {accepted ? t("invite.accepted") : t("invite.pending")}
                </Badge>
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
                  {t("invite.revoke")}
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
            <AlertDialogTitle>
              {t("invite.revokeTitle", { email: revokeTarget?.email ?? t("invite.thisAddress") })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("invite.revokeDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>{t("invite.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={submitting} onClick={handleConfirm}>
              {submitting ? t("invite.revoking") : t("invite.revoke")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
