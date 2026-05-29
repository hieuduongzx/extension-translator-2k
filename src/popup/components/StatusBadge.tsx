import { Loader2 } from "lucide-react";

interface StatusBadgeProps {
  active: boolean;
  count: number;
  pending: number;
}

/**
 * Two-column live status row used under the primary CTA in the popup.
 *  - When inactive, renders nothing (the CTA already conveys state).
 *  - When active, shows "{N} segments translated" on the left and an
 *    optional "{M} batches pending" indicator on the right.
 */
export function StatusBadge({ active, count, pending }: StatusBadgeProps) {
  if (!active) return null;

  return (
    <div className="flex items-center justify-between text-[11px] px-1">
      <span className="text-zinc-500">
        Đã dịch {count} đoạn
      </span>
      {pending > 0 && (
        <span className="flex items-center gap-1 text-brand-700">
          <Loader2 className="w-3 h-3 animate-spin" />
          {pending} lô đang xử lý
        </span>
      )}
    </div>
  );
}
