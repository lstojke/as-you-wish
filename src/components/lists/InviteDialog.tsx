import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { actions, isInputError } from "astro:actions";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { invitationRoleSchema } from "@/lib/schemas/wishlist";
import type { InvitationRow } from "@/lib/services/invitations";
import { z } from "zod";
import { useT } from "@/components/hooks/useT";

// Preprocess-free so the resolver's input type is `string`, not `unknown`; the
// server action re-validates and normalizes via the full invitationCreateSchema.
const inviteFormSchema = z.object({
  email: z.email("validation.emailInvalid").max(320),
  role: invitationRoleSchema,
});
type InviteFormValues = z.infer<typeof inviteFormSchema>;

interface Props {
  listId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: (invitation: InvitationRow) => void;
}

export default function InviteDialog({ listId, open, onOpenChange, onInvited }: Props) {
  const { t, tm } = useT();
  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: { email: "", role: "viewer" },
  });

  useEffect(() => {
    form.reset({ email: "", role: "viewer" });
  }, [open, form]);

  async function onSubmit(values: InviteFormValues) {
    const { data, error } = await actions.invitations.create({ listId, email: values.email, role: values.role });

    if (error) {
      if (isInputError(error)) {
        const emailMessage = error.fields.email?.[0];
        if (emailMessage) {
          form.setError("email", { message: tm(emailMessage) });
          return;
        }
      }
      form.setError("email", { message: error.message || t("errors.inviteSend") });
      return;
    }

    onInvited(data.invitation);
    onOpenChange(false);
    if (data.emailSent) {
      toast.success(t("invite.sent"));
    } else {
      toast.warning(t("invite.createdEmailFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("invite.title")}</DialogTitle>
          <DialogDescription>{t("invite.description")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("invite.email")}</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder={t("invite.emailPlaceholder")}
                      autoFocus
                      autoComplete="off"
                      maxLength={320}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("invite.role")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={form.formState.isSubmitting}>
                    <FormControl>
                      <SelectTrigger onBlur={field.onBlur} ref={field.ref}>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="viewer">{t("invite.viewer")}</SelectItem>
                      <SelectItem value="collaborator">{t("invite.collaborator")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {t(field.value === "collaborator" ? "invite.collaboratorDescription" : "invite.viewerDescription")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                }}
                disabled={form.formState.isSubmitting}
              >
                {t("invite.cancel")}
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? t("invite.sending") : t("invite.send")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
