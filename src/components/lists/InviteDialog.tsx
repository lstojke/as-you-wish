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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { invitationCreateSchema } from "@/lib/schemas/wishlist";
import type { InvitationRow } from "@/lib/services/invitations";
import { z } from "zod";

const inviteFormSchema = invitationCreateSchema.pick({ email: true });
type InviteFormValues = z.infer<typeof inviteFormSchema>;

interface Props {
  listId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: (invitation: InvitationRow) => void;
}

export default function InviteDialog({ listId, open, onOpenChange, onInvited }: Props) {
  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: { email: "" },
  });

  useEffect(() => {
    form.reset({ email: "" });
  }, [open, form]);

  async function onSubmit(values: InviteFormValues) {
    const { data, error } = await actions.invitations.create({ listId, email: values.email });

    if (error) {
      if (isInputError(error)) {
        const emailMessage = error.fields.email?.[0];
        if (emailMessage) {
          form.setError("email", { message: emailMessage });
          return;
        }
      }
      form.setError("email", { message: error.message || "Could not send invitation" });
      return;
    }

    onInvited(data.invitation);
    onOpenChange(false);
    if (data.emailSent) {
      toast.success("Invitation sent");
    } else {
      toast.warning("Invitation created, but the email couldn't be sent");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite someone</DialogTitle>
          <DialogDescription>They&rsquo;ll get an email with a link to accept and view this list.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="name@example.com"
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
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                }}
                disabled={form.formState.isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Sending…" : "Send invite"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
