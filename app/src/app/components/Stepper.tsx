// app/src/app/components/Stepper.tsx
import React from "react";

type Props = {
  value: number;
  steps: number[];
  onChange: (v: number) => void;
  disabled?: boolean;
  className?: string;
};

export default function Stepper({
  value,
  steps,
  onChange,
  disabled,
  className,
}: Props) {
  const idx = Math.max(
    0,
    steps.findIndex((s) => s >= value) === -1
      ? steps.length - 1
      : steps.findIndex((s) => s >= value),
  );

  const dec = () => {
    if (disabled) return;
    if (idx <= 0) return;
    onChange(steps[idx - 1]);
  };
  const inc = () => {
    if (disabled) return;
    if (idx >= steps.length - 1) return;
    onChange(steps[idx + 1]);
  };

  return (
    <div className={`inline-flex items-center gap-2 ${className || ""}`}>
      <button
        type="button"
        onClick={dec}
        disabled={disabled || idx === 0}
        className="px-2 py-1 rounded-xl shadow disabled:opacity-50"
        aria-label="Decrease"
      >
        −
      </button>
      <span className="tabular-nums w-14 text-center">{steps[idx]}</span>
      <button
        type="button"
        onClick={inc}
        disabled={disabled || idx === steps.length - 1}
        className="px-2 py-1 rounded-xl shadow disabled:opacity-50"
        aria-label="Increase"
      >
        ＋
      </button>
    </div>
  );
}
