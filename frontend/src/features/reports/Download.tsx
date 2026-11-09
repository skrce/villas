import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "../../app/context";
import { getSessionEpoch } from "../../api/session";
import { errorMessage } from "../../shared/errors";
import { Notice } from "../../shared/ui";
import type { Report } from "./data";

export function Download({
  report,
  enabled,
}: {
  report: Report;
  enabled: boolean;
}) {
  const { apis, epoch, businessId } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const active = useRef(true);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      controller.current?.abort();
    };
  }, []);
  const download = async () => {
    if (busy || !enabled) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await apis.reportsApi.exportReportRaw(
        {
          kind: report.kind,
          startDate: report.startDate,
          endDate: report.endDate,
          roomId: report.roomId ?? undefined,
          snapshotId: report.snapshotId,
        },
        { signal: request.signal },
      );
      if (
        !response.raw.headers
          .get("content-type")
          ?.toLowerCase()
          .startsWith("text/csv")
      )
        throw new Error("Unexpected download type");
      const blob = await response.raw.blob();
      if (blob.size > 5 * 1024 * 1024) throw new Error("Oversized download");
      if (
        !active.current ||
        request.signal.aborted ||
        epoch !== getSessionEpoch()
      )
        return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `villas-${businessId}-${report.kind.toLowerCase()}-${report.startDate}-${report.endDate}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setMessage(
        "CSV downloaded. It includes every source row in this report. Keep it private.",
      );
    } catch (error) {
      const text = await errorMessage(error);
      if (
        active.current &&
        !request.signal.aborted &&
        epoch === getSessionEpoch()
      ) {
        setFailed(true);
        setMessage(
          text ===
            "The result could not be confirmed. Check the saved records before retrying."
            ? "The CSV could not be downloaded. Refresh the report and try again."
            : text,
        );
      }
    } finally {
      if (active.current && epoch === getSessionEpoch()) setBusy(false);
    }
  };
  return (
    <>
      <button
        className="button secondary"
        disabled={!enabled || busy}
        onClick={() => void download()}
      >
        {busy ? "Preparing CSV…" : "Download complete CSV"}
      </button>
      <p className="hint">
        Private UTF-8 CSV with metadata and all source rows. Import columns as
        text to preserve exact IDs, cents and receipt formatting. Text guards
        protect formulas and long numbers.
      </p>
      {message && <Notice error={failed}>{message}</Notice>}
    </>
  );
}
