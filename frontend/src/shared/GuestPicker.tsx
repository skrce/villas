import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "../app/context";
import type { Customer } from "../api/generated";
export function GuestPicker({
  value,
  label,
  onChange,
  error,
}: {
  value: string;
  label: string;
  onChange: (id: string, label: string) => void;
  error?: string;
}) {
  const { apis } = useWorkspace();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(label.trim());
      setActive(-1);
    }, 250);
    return () => clearTimeout(timer);
  }, [label]);
  const query = useQuery({
    queryKey: ["guests", "picker", search],
    queryFn: ({ signal }) =>
      apis.customerApi.queryCustomers(
        {
          guestQueryRequest: /^[+\d\p{Z}\s().-]+$/u.test(search)
            ? { phone: search, limit: 20 }
            : { name: search, limit: 20 },
        },
        { signal },
      ),
    enabled: !value && search.length >= 2,
  });
  const items = query.data?.items ?? [];
  const visible =
    open && !value && search.length >= 2 && search === label.trim();
  const choose = (guest: Customer) => {
    onChange(String(guest.id), `${guest.firstName} ${guest.lastName}`);
    setOpen(false);
  };
  return (
    <div className="field guest-picker">
      <label htmlFor={id}>Guest</label>
      <input
        id={id}
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={`${id}-list`}
        aria-activedescendant={
          visible && active >= 0 ? `${id}-option-${active}` : undefined
        }
        aria-describedby={`${id}-help`}
        aria-invalid={!!error}
        value={label}
        maxLength={200}
        onChange={(event) => {
          onChange("", event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            event.preventDefault();
          }
          if (
            visible &&
            items.length &&
            ["ArrowDown", "ArrowUp"].includes(event.key)
          ) {
            event.preventDefault();
            setActive(
              (previous) =>
                (previous +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  items.length) %
                items.length,
            );
          }
          if (
            visible &&
            event.key === "Enter" &&
            active >= 0 &&
            items[active]
          ) {
            event.preventDefault();
            choose(items[active]);
          }
        }}
      />
      <p id={`${id}-help`} className={error ? "field-error" : "hint"}>
        {error ||
          (value
            ? "Guest selected. Edit to choose someone else."
            : "Type a name or phone, then choose a match.")}
      </p>
      <ul
        id={`${id}-list`}
        role="listbox"
        aria-label="Matching guests"
        hidden={!visible}
      >
        {items.map((guest, index) => (
          <li
            key={guest.id}
            role="option"
            id={`${id}-option-${index}`}
            aria-selected={index === active}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(guest)}
          >
            {guest.firstName} {guest.lastName}
            <small>{guest.phone}</small>
          </li>
        ))}
      </ul>
      {visible && (
        <p role="status" className="hint">
          {query.isFetching
            ? "Finding guests…"
            : query.isError
              ? "Guest search unavailable. Edit the search to try again."
              : !items.length
                ? "No matches. Use Add guest to create a profile."
                : `${items.length} matches${query.data?.nextCursor ? ", refine the search for more" : ""}. Use arrow keys and Enter to select.`}
        </p>
      )}
    </div>
  );
}
