"use client";

// Interrupteur avec son libellé (et une explication facultative), même apparence que dans les notifications
export default function Switch({
  id,
  label,
  hint,
  checked,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border-2 border-line bg-surface p-4">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <label htmlFor={id} id={`${id}-label`} className={`text-sm font-bold ${disabled ? "" : "cursor-pointer"}`}>
          {label}
        </label>
        {hint && (
          <span id={`${id}-hint`} className="text-xs leading-snug text-muted">
            {hint}
          </span>
        )}
      </span>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:cursor-not-allowed disabled:opacity-60 ${
          checked ? "border-accent-ink bg-accent" : "border-muted bg-background"
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-5 w-5 rounded-full transition-transform ${
            checked ? "translate-x-[22px] bg-on-accent" : "translate-x-0.5 bg-muted"
          }`}
        />
      </button>
    </div>
  );
}
