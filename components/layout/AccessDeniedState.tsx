import { ShieldAlert } from "lucide-react";

export function AccessDeniedState({ resource }: { resource?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-danger/40 bg-danger/5 px-6 py-16 text-center">
      <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-danger/10">
        <ShieldAlert className="size-6 text-danger" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-foreground">You don&apos;t have access to this page</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {resource ? `Your role doesn't have permission to view ${resource}.` : "Your role doesn't have permission to view this content."} Contact an admin if you believe this is a mistake.
      </p>
    </div>
  );
}
