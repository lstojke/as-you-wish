import { useEffect, useRef, useState } from "react";
import { actions } from "astro:actions";
import type { ListShareView } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  listId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ShareLinkDialog({ listId, open, onOpenChange }: Props) {
  const [share, setShare] = useState<ListShareView | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<"disable" | "replace" | null>(null);
  const busy = useRef(true);

  useEffect(() => {
    let cancelled = false;
    if (open) {
      void actions.listShares
        .status({ listId })
        .then(({ data, error: actionError }) => {
          if (cancelled) return;
          if (actionError) setError(actionError.message);
          else setShare(data);
        })
        .catch(() => {
          if (!cancelled) setError("Could not load sharing status. Please retry.");
        })
        .finally(() => {
          if (!cancelled) {
            busy.current = false;
            setPending(false);
          }
        });
    }
    return () => {
      cancelled = true;
    };
  }, [open, listId]);

  async function run(operation: "status" | "create" | "disable" | "replace") {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    setMessage("");
    setConfirmation(null);
    try {
      const { data, error: actionError } = await actions.listShares[operation]({ listId });
      if (actionError) throw new Error(actionError.message);
      setShare(data);
    } catch {
      setShare(null);
      setError("The request could not be confirmed. Sharing status has been refreshed; check it before trying again.");
      try {
        const refreshed = await actions.listShares.status({ listId });
        if (refreshed.error) throw new Error(refreshed.error.message);
        setShare(refreshed.data);
      } catch {
        setError("Could not confirm sharing status. Retry loading it before making another change.");
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function copyLink() {
    if (share?.state !== "active" || busy.current) return;
    setError("");
    setMessage("");
    try {
      await navigator.clipboard.writeText(share.url);
      setMessage("Link copied.");
    } catch {
      setError("Could not copy the link. Select the URL above and copy it manually.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy.current) onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share read-only link</DialogTitle>
          <DialogDescription>
            Anyone with this link can view and forward your wishlist without an account. No reservation information is
            shown and the link does not grant membership.
          </DialogDescription>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">
          Links do not expire automatically. Disabling or replacing a link stops future access, but cannot remove copies
          people already received.
        </p>
        {pending && <p role="status">Loading sharing status…</p>}
        {share?.state === "active" && (
          <div className="space-y-2">
            <label htmlFor="share-link-url" className="text-sm font-medium">
              Read-only URL
            </label>
            <Input
              id="share-link-url"
              value={share.url}
              readOnly
              onFocus={(event) => {
                event.target.select();
              }}
            />
            <Button type="button" disabled={pending} onClick={copyLink}>
              Copy link
            </Button>
          </div>
        )}
        {share?.state === "not_created" && <p className="text-sm">No read-only link has been created.</p>}
        {share?.state === "disabled" && (
          <p className="text-sm">
            Sharing is disabled. Create a replacement to share again; the old URL will stay invalid.
          </p>
        )}
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
        {confirmation && (
          <div className="border-border space-y-3 rounded-lg border p-3">
            <p className="text-sm">
              {confirmation === "disable"
                ? "Disable this link for everyone? To share again, you will need to create and send a replacement URL."
                : "Create a replacement link? The old URL will stop working for everyone. Send the new URL to recipients."}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setConfirmation(null);
                }}
              >
                Keep current state
              </Button>
              <Button type="button" disabled={pending} onClick={() => run(confirmation)}>
                {confirmation === "disable" ? "Confirm disable" : "Confirm replacement"}
              </Button>
            </div>
          </div>
        )}
        <DialogFooter className="flex-wrap">
          {!share && !pending && (
            <Button type="button" onClick={() => run("status")}>
              Retry loading
            </Button>
          )}
          {share?.state === "not_created" && (
            <Button type="button" disabled={pending} onClick={() => run("create")}>
              Create link
            </Button>
          )}
          {share?.state === "active" && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setConfirmation("disable");
              }}
            >
              Disable link
            </Button>
          )}
          {share && share.state !== "not_created" && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setConfirmation("replace");
              }}
            >
              Create replacement link
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
