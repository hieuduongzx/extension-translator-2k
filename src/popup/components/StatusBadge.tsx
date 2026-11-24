import { Loader2 } from "lucide-react";

interface StatusBadgeProps {
  active: boolean;
  count: number;
  pending: number;
}

/**
 * Two-column live status row used under the primary CTA in the popup.
 */
export function StatusBadge({ active, count, pending }: StatusBadgeProps) {
  if (!active) return null;

  return (
    <div role="status" className="flex items-center justify-between text-[11.5px] px-1">
      <span className="text-muted">Translated {count} segments</span>
      {pending > 0 && (
        <span className="flex items-center gap-1 text-accent font-medium">
          <Loader2 className="w-3 h-3 animate-spin" />
          {pending} batches pending
        </span>
      )}
    </div>
  );
}
