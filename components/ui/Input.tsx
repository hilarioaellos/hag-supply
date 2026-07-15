import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-sm font-500 text-hag-text">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`h-10 rounded-lg border px-3 text-sm outline-none transition-colors bg-hag-bg text-hag-text placeholder:text-hag-text-3 ${
            error
              ? "border-hag-sale focus:ring-1 focus:ring-hag-sale"
              : "border-hag-border focus:border-hag-accent focus:ring-1 focus:ring-hag-accent"
          } ${className}`}
          {...props}
        />
        {error && <p className="text-xs text-hag-sale">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
