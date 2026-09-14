import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

const controlClasses =
  "mt-2 min-h-12 w-full rounded-tapit border border-tapit-line bg-tapit-surface px-3.5 py-3 text-sm text-tapit-ink shadow-sm outline-none placeholder:text-tapit-muted/80 transition-colors focus:border-tapit-accent focus:ring-2 focus:ring-tapit-accent/20 disabled:cursor-not-allowed disabled:bg-tapit-soft-surface disabled:opacity-70";

export function Field({
  error,
  help,
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { error?: string; help?: string; label: string }) {
  const errorId = props.id ? `${props.id}-error` : undefined;
  const helpId = props.id ? `${props.id}-help` : undefined;
  return (
    <div>
      <label className="block text-sm font-semibold text-tapit-ink" htmlFor={props.id}>
        {label}
      </label>
      <input
        {...props}
        aria-describedby={
          [help ? helpId : undefined, error ? errorId : undefined].filter(Boolean).join(" ") ||
          undefined
        }
        aria-invalid={Boolean(error)}
        className={`${controlClasses} ${error ? "border-tapit-danger" : ""}`}
      />
      {help ? (
        <p className="mt-1.5 text-xs leading-5 text-tapit-muted" id={helpId}>
          {help}
        </p>
      ) : null}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-tapit-danger" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextareaField({
  error,
  help,
  label,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string; help?: string; label: string }) {
  const errorId = props.id ? `${props.id}-error` : undefined;
  const helpId = props.id ? `${props.id}-help` : undefined;
  return (
    <div>
      <label className="block text-sm font-semibold text-tapit-ink" htmlFor={props.id}>
        {label}
      </label>
      <textarea
        {...props}
        aria-describedby={
          [help ? helpId : undefined, error ? errorId : undefined].filter(Boolean).join(" ") ||
          undefined
        }
        aria-invalid={Boolean(error)}
        className={`${controlClasses} min-h-28 resize-y ${error ? "border-tapit-danger" : ""}`}
      />
      {help ? (
        <p className="mt-1.5 text-xs leading-5 text-tapit-muted" id={helpId}>
          {help}
        </p>
      ) : null}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-tapit-danger" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SelectField({
  children,
  label,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode; label: string }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-tapit-ink" htmlFor={props.id}>
        {label}
      </label>
      <select {...props} className={controlClasses}>
        {children}
      </select>
    </div>
  );
}
