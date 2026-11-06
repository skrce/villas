import { useWorkspace } from "../app/context";
import { validVersion } from "./format";
import { Dialog, MutationNotice, Notice } from "./ui";
import { useSave } from "./useSave";

export function RecordStatusDialog({
  kind,
  record,
  name,
  onClose,
}: {
  kind: "guest" | "room";
  record: { id?: number | null; version?: number; active?: boolean };
  name: string;
  onClose: () => void;
}) {
  const { apis } = useWorkspace();
  const active = record.active !== false;
  const version = record.version;
  const save = useSave<void>(async () => {
    if (!validVersion(version) || !record.id)
      throw new Error("Reload the saved version before changing status.");
    const body = { expectedVersion: version, active: !active };
    const saved = await (kind === "guest"
      ? apis.customerApi.setCustomerStatus({
          customerId: record.id,
          recordStatusRequest: body,
        })
      : apis.apartmentApi.setApartmentStatus({
          apartmentId: record.id,
          recordStatusRequest: body,
        }));
    if (
      !saved ||
      saved.id !== record.id ||
      saved.active !== !active ||
      !validVersion(saved.version)
    )
      throw new Error("The status result could not be confirmed.");
    return saved;
  }, onClose);
  return (
    <Dialog
      title={`${active ? "Archive" : "Restore"} ${kind}?`}
      busy={save.isPending}
      onClose={onClose}
    >
      <p>
        <strong>{name}</strong>
      </p>
      <p>
        {active
          ? "History will be retained. Current and future reservations must be resolved first."
          : "This record will become available for new reservations again."}
      </p>
      {!validVersion(version) && (
        <Notice error>
          The saved version is unavailable. Close this dialog and reload the
          record.
        </Notice>
      )}
      <MutationNotice save={save} />
      {save.message && !save.code && (
        <p className="hint">
          Close this dialog and refresh the details before repeating this
          action.
        </p>
      )}
      <div className="dialog-actions">
        <button
          className="button secondary"
          disabled={save.isPending}
          onClick={onClose}
        >
          Keep {active ? "active" : "archived"}
        </button>
        <button
          className={`button ${active ? "danger" : ""}`}
          disabled={save.isPending || save.stale || !validVersion(version)}
          onClick={() => void save.submit()}
        >
          {save.isPending
            ? "Saving…"
            : `${active ? "Archive" : "Restore"} ${kind}`}
        </button>
      </div>
    </Dialog>
  );
}
