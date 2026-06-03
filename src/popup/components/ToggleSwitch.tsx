interface ToggleSwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label?: string;
  ariaLabel?: string;
}

/**
 * Reusable toggle switch component. Renders as a pill-shaped button
 * with an animated inner dot.
 */
export function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  label,
  ariaLabel = label
}: ToggleSwitchProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`relative w-10 h-[22px] rounded-full transition-colors shrink-0 ${
        checked ? "bg-brand-600" : "bg-zinc-300"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      aria-pressed={checked}
      aria-label={ariaLabel}
    >
      <span
        className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all ${
          checked ? "left-[22px]" : "left-[3px]"
        }`}
      />
    </button>
  );
}
