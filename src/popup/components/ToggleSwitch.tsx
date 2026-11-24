interface ToggleSwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label?: string;
  ariaLabel?: string;
}

/**
 * Accessible toggle switch aligned with TubeDeck2k's `.ui-switch` (36×20px).
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
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`ui-switch ${checked ? "is-on" : ""}`}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
    >
      <span className="ui-switch-thumb" />
    </button>
  );
}
