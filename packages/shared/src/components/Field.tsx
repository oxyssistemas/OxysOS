import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  id: string;
  erro?: string;
}

export function Field({ label, id, erro, ...props }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text-secondary">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={!!erro}
        aria-describedby={erro ? `${id}-erro` : undefined}
        className={`rounded-lg border bg-base px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-accent ${
          erro ? "border-danger" : "border-border focus:border-accent"
        }`}
        {...props}
      />
      {erro && (
        <p id={`${id}-erro`} className="text-xs text-danger">
          {erro}
        </p>
      )}
    </div>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  id: string;
  erro?: string;
  children: ReactNode;
}

export function SelectField({ label, id, erro, children, ...props }: SelectFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text-secondary">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={!!erro}
        aria-describedby={erro ? `${id}-erro` : undefined}
        className={`rounded-lg border bg-base px-3.5 py-2.5 text-sm text-text-primary transition-colors focus:border-accent ${
          erro ? "border-danger" : "border-border"
        }`}
        {...props}
      >
        {children}
      </select>
      {erro && (
        <p id={`${id}-erro`} className="text-xs text-danger">
          {erro}
        </p>
      )}
    </div>
  );
}

interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  id: string;
  erro?: string;
}

export function TextareaField({ label, id, erro, ...props }: TextareaFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text-secondary">
        {label}
      </label>
      <textarea
        id={id}
        aria-invalid={!!erro}
        aria-describedby={erro ? `${id}-erro` : undefined}
        className={`min-h-[96px] resize-y rounded-lg border bg-base px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-accent ${
          erro ? "border-danger" : "border-border"
        }`}
        {...props}
      />
      {erro && (
        <p id={`${id}-erro`} className="text-xs text-danger">
          {erro}
        </p>
      )}
    </div>
  );
}
