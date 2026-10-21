import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

const controlClasses =
  "min-h-11 w-full rounded-control bg-tapit-soft-surface px-4 py-3 text-sm text-tapit-ink placeholder:text-tapit-muted transition-colors focus:bg-tapit-surface focus:outline-3 focus:outline-offset-2 focus:outline-tapit-accent disabled:cursor-not-allowed disabled:opacity-70 aria-invalid:bg-tapit-danger-soft aria-invalid:focus:outline-tapit-danger";

function Label({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label className="text-sm font-semibold text-tapit-ink" htmlFor={htmlFor}>
      {children}
    </label>
  );
}

function Messages({
  error,
  errorId,
  help,
  helpId,
}: {
  error?: string;
  errorId?: string;
  help?: string;
  helpId?: string;
}) {
  return (
    <>
      {help ? (
        <p className="text-xs text-tapit-muted" id={helpId}>
          {help}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs font-medium text-tapit-danger" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

function describedBy(help?: string, helpId?: string, error?: string, errorId?: string) {
  return (
    [help ? helpId : undefined, error ? errorId : undefined].filter(Boolean).join(" ") || undefined
  );
}

export function Field({
  error,
  help,
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { error?: string; help?: string; label: string }) {
  const errorId = props.id ? `${props.id}-error` : undefined;
  const helpId = props.id ? `${props.id}-help` : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={props.id}>{label}</Label>
      <input
        {...props}
        aria-describedby={describedBy(help, helpId, error, errorId)}
        aria-invalid={Boolean(error)}
        className={controlClasses}
      />
      <Messages error={error} errorId={errorId} help={help} helpId={helpId} />
    </div>
  );
}

export function TextareaField({
  compact = false,
  error,
  help,
  label,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  compact?: boolean;
  error?: string;
  help?: string;
  label: string;
}) {
  const errorId = props.id ? `${props.id}-error` : undefined;
  const helpId = props.id ? `${props.id}-help` : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={props.id}>{label}</Label>
      <textarea
        {...props}
        aria-describedby={describedBy(help, helpId, error, errorId)}
        aria-invalid={Boolean(error)}
        className={`${controlClasses} ${compact ? "min-h-20" : "min-h-28"} resize-y`}
      />
      <Messages error={error} errorId={errorId} help={help} helpId={helpId} />
    </div>
  );
}

export function SelectField({
  children,
  label,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode; label: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={props.id}>{label}</Label>
      <select {...props} className={controlClasses}>
        {children}
      </select>
    </div>
  );
}
