import { CircleAlert } from "lucide-react";
import { useT } from "@/components/hooks/useT";

interface ServerErrorProps {
  message?: string | null;
}

export function ServerError({ message }: ServerErrorProps) {
  const { tm } = useT();
  if (!message) return null;

  return (
    <p className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-900/30 px-3 py-2 text-sm text-red-300">
      <CircleAlert className="size-4 shrink-0" />
      {tm(message)}
    </p>
  );
}
