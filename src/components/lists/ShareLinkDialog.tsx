import { useEffect, useRef, useState } from "react";
import { actions } from "astro:actions";
import type { ListShareView } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/components/hooks/useT";
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
  const { t, tm } = useT();
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
          if (!cancelled) setError("shareLink.loadFailed");
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
      setError("shareLink.requestFailed");
      try {
        const refreshed = await actions.listShares.status({ listId });
        if (refreshed.error) throw new Error(refreshed.error.message);
        setShare(refreshed.data);
      } catch {
        setError("shareLink.statusFailed");
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
      setMessage("shareLink.copied");
    } catch {
      setError("shareLink.copyFailed");
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
          <DialogTitle>{t("shareLink.title")}</DialogTitle>
          <DialogDescription>{t("shareLink.description")}</DialogDescription>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">{t("shareLink.expiration")}</p>
        {pending && <p role="status">{t("shareLink.loading")}</p>}
        {share?.state === "active" && (
          <div className="space-y-2">
            <label htmlFor="share-link-url" className="text-sm font-medium">
              {t("shareLink.url")}
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
              {t("shareLink.copy")}
            </Button>
          </div>
        )}
        {share?.state === "not_created" && <p className="text-sm">{t("shareLink.notCreated")}</p>}
        {share?.state === "disabled" && <p className="text-sm">{t("shareLink.disabled")}</p>}
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {tm(error)}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm">
            {tm(message)}
          </p>
        )}
        {confirmation && (
          <div className="border-border space-y-3 rounded-lg border p-3">
            <p className="text-sm">
              {confirmation === "disable" ? t("shareLink.disableConfirm") : t("shareLink.replaceConfirm")}
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
                {t("shareLink.keepCurrent")}
              </Button>
              <Button type="button" disabled={pending} onClick={() => run(confirmation)}>
                {confirmation === "disable" ? t("shareLink.confirmDisable") : t("shareLink.confirmReplace")}
              </Button>
            </div>
          </div>
        )}
        <DialogFooter className="flex-wrap">
          {!share && !pending && (
            <Button type="button" onClick={() => run("status")}>
              {t("shareLink.retry")}
            </Button>
          )}
          {share?.state === "not_created" && (
            <Button type="button" disabled={pending} onClick={() => run("create")}>
              {t("shareLink.create")}
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
              {t("shareLink.disable")}
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
              {t("shareLink.replace")}
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
            {t("shareLink.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
