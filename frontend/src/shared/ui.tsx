import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useContext,
  useId,
  useRef,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { WorkspaceContext } from "../app/context";
export function TextArea({
  label,
  error,
  hint,
  ...props
}: ComponentProps<"textarea"> & {
  label: string;
  error?: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        {...props}
        id={id}
        aria-invalid={!!error}
        aria-describedby={error || hint ? `${id}-help` : undefined}
      />
      {(error || hint) && (
        <p className={error ? "field-error" : "hint"} id={`${id}-help`}>
          {error || hint}
        </p>
      )}
    </div>
  );
}
export function RecordState({ active }: { active?: boolean }) {
  return (
    <span
      className={`status ${active === false ? "status-cancelled" : "status-active"}`}
    >
      {active === false ? "Archived" : "Active"}
    </span>
  );
}
export function MutationNotice({
  save,
}: {
  save: { message: string; relatedIds: number[]; moreRecords: boolean };
}) {
  if (!save.message) return null;
  return (
    <Notice error>
      <p>{save.message}</p>
      {save.relatedIds.length > 0 && (
        <ul className="conflict-links">
          {save.relatedIds.map((id) => (
            <li key={id}>
              <Link to={`/reservations/${id}`}>Reservation #{id}</Link>
            </li>
          ))}
        </ul>
      )}
      {save.moreRecords && (
        <p>
          Additional reservations also need resolution. Resolve these, then
          check again.
        </p>
      )}
    </Notice>
  );
}
export function Field({
  label,
  error,
  hint,
  ...props
}: ComponentProps<"input"> & {
  label: string;
  error?: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        {...props}
        id={id}
        aria-invalid={!!error}
        aria-describedby={error || hint ? `${id}-help` : undefined}
      />
      {(error || hint) && (
        <p className={error ? "field-error" : "hint"} id={`${id}-help`}>
          {error || hint}
        </p>
      )}
    </div>
  );
}
export function SelectField({
  label,
  error,
  hint,
  children,
  ...props
}: ComponentProps<"select"> & {
  label: string;
  error?: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        {...props}
        id={id}
        aria-invalid={!!error}
        aria-describedby={error || hint ? `${id}-help` : undefined}
      >
        {children}
      </select>
      {(error || hint) && (
        <p className={error ? "field-error" : "hint"} id={`${id}-help`}>
          {error || hint}
        </p>
      )}
    </div>
  );
}
export function Status({ value }: { value?: string }) {
  return (
    <span className={`status status-${value?.toLowerCase()}`}>
      {value === "ACTIVE"
        ? "Active"
        : value === "CANCELLED"
          ? "Cancelled"
          : value === "PENDING"
            ? "Invited"
            : value || "Unknown"}
    </span>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={error ? "notice error" : "notice"}
      role={error ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
export function Empty({
  title,
  children,
  headingLevel = 3,
}: {
  title: string;
  children?: ReactNode;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="empty">
      <span aria-hidden="true">◇</span>
      <Heading>{title}</Heading>
      <p>{children}</p>
    </div>
  );
}
export function Pending({ label = "Loading records…" }: { label?: string }) {
  return (
    <p className="loading" role="status">
      {label}
    </p>
  );
}
export function QueryError({ retry }: { retry: () => void }) {
  return (
    <div className="notice error" role="alert">
      <p>
        These records could not be loaded. Check your connection and try again.
      </p>
      <button className="button secondary" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
export function PageHead({
  eyebrow,
  title,
  children,
  actions,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const workspace = useContext(WorkspaceContext);
  return (
    <header className="page-head">
      <div>
        <p className="eyebrow">
          {eyebrow || workspace?.businessName || "Staff workspace"}
        </p>
        <h1>{title}</h1>
        {children && <p className="lede">{children}</p>}
      </div>
      <div className="actions">{actions}</div>
    </header>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus();
      else document.getElementById("main")?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={heading}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="dialog-head">
        <h2 id={heading}>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Table({
  label,
  headings,
  children,
}: {
  label: string;
  headings: string[];
  children: ReactNode;
}) {
  return (
    <div className="table-wrap" role="region" aria-label={label} tabIndex={0}>
      <table>
        <thead>
          <tr>
            {headings.map((heading) => (
              <th key={heading} scope="col">
                {heading || <span className="sr-only">Actions</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Children.map(children, (row) => {
            if (
              !isValidElement<{ children?: ReactNode }>(row) ||
              row.type !== "tr"
            )
              return row;
            return cloneElement(
              row,
              {},
              Children.map(row.props.children, (cell, index) => {
                if (
                  !isValidElement<{
                    children?: ReactNode;
                    "data-label"?: string;
                  }>(cell) ||
                  cell.type !== "td"
                )
                  return cell;
                const heading = headings[index] || "Actions";
                return cloneElement(
                  cell,
                  { "data-label": heading },
                  <span className="mobile-column" aria-hidden="true">
                    {heading}
                  </span>,
                  cell.props.children,
                );
              }),
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
