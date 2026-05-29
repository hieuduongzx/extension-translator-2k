import { ArrowRight } from "lucide-react";
import { Dropdown } from "./Dropdown";
import { LANGUAGES } from "../../languages";

interface LanguagePairProps {
  source: string;
  target: string;
  onSourceChange: (value: string) => void;
  onTargetChange: (value: string) => void;
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
 * Compact "from → to" language picker. Both dropdowns share one card with an
 * arrow between them, replacing the two separate labelled cards.
 */
export function LanguagePair({
  source,
  target,
  onSourceChange,
  onTargetChange
}: LanguagePairProps) {
  return (
    <div className="surface-card p-2.5">
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
    </div>
  );
}
