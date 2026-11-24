import { ArrowRight, ArrowRightLeft } from "lucide-react";
import { Dropdown } from "./Dropdown";
import { LANGUAGES } from "../../languages";

interface LanguagePairProps {
  source: string;
  target: string;
  onSourceChange: (value: string) => void;
  onTargetChange: (value: string) => void;
  /** Render without the card wrapper so it can sit inside a shared card. */
  bare?: boolean;
  /** When provided, renders a swap button that calls `onSwap`. */
  onSwap?: () => void;
  /** Disable the swap button (e.g. when source is "auto"). */
  swapDisabled?: boolean;
}

const SOURCE_OPTIONS = LANGUAGES.map((lang) => ({
  value: lang.code,
  label: lang.native,
  description: lang.name
}));

const TARGET_OPTIONS = LANGUAGES.filter((l) => l.code !== "auto").map((lang) => ({
  value: lang.code,
  label: lang.native,
  description: lang.name
}));

/**
 * Compact "from → to" language picker.
 */
export function LanguagePair({
  source,
  target,
  onSourceChange,
  onTargetChange,
  bare = false,
  onSwap,
  swapDisabled = false
}: LanguagePairProps) {
  const inner = (
    <div className="flex items-end gap-2">
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <span className="section-label">From</span>
        <Dropdown
          value={source}
          options={SOURCE_OPTIONS}
          onChange={onSourceChange}
          ariaLabel="Source language"
        />
      </div>
      {onSwap ? (
        <button
          type="button"
          onClick={onSwap}
          disabled={swapDisabled}
          title="Swap languages"
          aria-label="Swap languages"
          className="btn-ghost-sm w-8 h-8 p-0 shrink-0"
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
        </button>
      ) : (
        <ArrowRight className="w-4 h-4 text-muted shrink-0 mb-2" />
      )}
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <span className="section-label">To</span>
        <Dropdown
          value={target}
          options={TARGET_OPTIONS}
          onChange={onTargetChange}
          ariaLabel="Target language"
        />
      </div>
    </div>
  );

  if (bare) return inner;
  return <div className="surface-card p-2.5">{inner}</div>;
}
