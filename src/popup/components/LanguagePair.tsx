import { ArrowRight } from "lucide-react";
import { Dropdown } from "./Dropdown";
import { LANGUAGES } from "../../languages";

interface LanguagePairProps {
  source: string;
  target: string;
  onSourceChange: (value: string) => void;
  onTargetChange: (value: string) => void;
  /** Render without the card wrapper so it can sit inside a shared card. */
  bare?: boolean;
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
 * Compact "from → to" language picker. Both dropdowns share one row with an
 * arrow between them. Pass `bare` to drop the card wrapper when composing it
 * into a larger unified card.
 */
export function LanguagePair({
  source,
  target,
  onSourceChange,
  onTargetChange,
  bare = false
}: LanguagePairProps) {
  const inner = (
    <div className="flex items-center gap-2">
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <span className="section-label">Từ</span>
        <Dropdown value={source} options={SOURCE_OPTIONS} onChange={onSourceChange} />
      </div>
      <ArrowRight className="w-4 h-4 text-zinc-400 shrink-0 mt-5" />
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <span className="section-label">Sang</span>
        <Dropdown value={target} options={TARGET_OPTIONS} onChange={onTargetChange} />
      </div>
    </div>
  );

  if (bare) return inner;
  return <div className="surface-card p-2.5">{inner}</div>;
}
