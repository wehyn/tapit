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

const HTTP_PREFIX = /^\s*https?:\/\//i;

export function HttpsUrlField({
  error,
  help,
  label,
  onValueChange,
  value,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type" | "value"> & {
  error?: string;
  help?: string;
  label: string;
  onValueChange: (value: string) => void;
  value: string;
}) {
  const errorId = props.id ? `${props.id}-error` : undefined;
  const helpId = props.id ? `${props.id}-help` : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={props.id}>{label}</Label>
      <div
        className={`flex min-w-0 rounded-control transition-colors focus-within:outline-3 focus-within:outline-offset-2 ${error ? "bg-tapit-danger-soft focus-within:outline-tapit-danger" : "bg-tapit-soft-surface focus-within:bg-tapit-surface focus-within:outline-tapit-accent"}`}
      >
        <span
          aria-hidden="true"
          className="inline-flex min-h-11 shrink-0 select-none items-center pl-4 pr-1 text-sm font-semibold text-tapit-muted"
        >
          https://
        </span>
        <input
          {...props}
          aria-describedby={describedBy(help, helpId, error, errorId)}
          aria-invalid={Boolean(error)}
          autoCapitalize="none"
          autoComplete="url"
          className="min-h-11 w-full min-w-0 bg-transparent py-3 pr-4 text-sm text-tapit-ink outline-none! placeholder:text-tapit-muted disabled:cursor-not-allowed disabled:opacity-70"
          inputMode="url"
          onChange={(event) => {
            const rest = event.target.value.replace(HTTP_PREFIX, "");
            onValueChange(rest === "" ? "" : `https://${rest}`);
          }}
          spellCheck={false}
          type="text"
          value={value.replace(HTTP_PREFIX, "")}
        />
      </div>
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
