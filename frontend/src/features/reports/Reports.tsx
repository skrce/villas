import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useWorkspace } from "../../app/context";
import {
  addDays,
  dateLabel,
  euros,
  propertyToday,
  roomChoiceLabel,
} from "../../shared/format";
import { errorMessage } from "../../shared/errors";
import { phaseLabel } from "../../shared/operations";
import { methodLabel } from "../../shared/ledger";
import {
  Empty,
  Field,
  Notice,
  PageHead,
  Pending,
  SelectField,
  Table,
} from "../../shared/ui";
import { useOnline } from "../../shared/useOnline";
import {
  definition,
  kinds,
  noticeLabel,
  reportLabel,
  reportSchema,
  validPeriod,
  type Kind,
  type Report,
} from "./data";
import { Download } from "./Download";

const roomPage = z.object({
  items: z
    .array(
      z.object({
        id: z.number().int().positive(),
        name: z.string(),
        reference: z.string(),
        active: z.boolean(),
      }),
    )
    .max(50),
  nextCursor: z.number().int().positive().nullish(),
});
const money = (value: number | null) =>
  value === null ? "Unknown" : euros(value);
export function Reports() {
  const { apis } = useWorkspace();
  const online = useOnline();
  const [params, setParams] = useSearchParams();
  const today = propertyToday();
  const kind = params.get("kind") ?? "OCCUPANCY";
  const from = params.get("from") ?? `${today.slice(0, 7)}-01`;
  const to = params.get("to") ?? addDays(today, 1);
  const room = params.get("room") ?? "";
  const valid =
    kinds.includes(kind as Kind) &&
    validPeriod(from, to) &&
    (!room || (/^[1-9][0-9]*$/.test(room) && Number(room) <= 2147483647));
  const query = useQuery({
    queryKey: ["report", kind, from, to, room],
    enabled: valid,
    queryFn: async ({ signal }) => {
      try {
        const result = reportSchema.parse(
          await apis.reportsApi.readPeriodReport(
            {
              kind: kind as Kind,
              startDate: from,
              endDate: to,
              roomId: room ? Number(room) : undefined,
            },
            { signal },
          ),
        );
        if (
          result.kind !== kind ||
          result.startDate !== from ||
          result.endDate !== to ||
          result.roomId !== (room ? Number(room) : null)
        )
          throw new Error("Report filters did not match");
        return result;
      } catch (error) {
        throw new Error(await errorMessage(error));
      }
    },
  });
  const choices = useInfiniteQuery({
    queryKey: ["report-rooms"],
    initialPageParam: 0,
    queryFn: async ({ signal, pageParam }) =>
      roomPage.parse(
        await apis.apartmentApi.apartmentDirectory(
          { afterId: pageParam, limit: 50, includeArchived: true },
          { signal },
        ),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rooms = choices.data?.pages.flatMap((p) => p.items) ?? [];
  const data = valid ? query.data : undefined;
  const [filterError, setFilterError] = useState("");
  return (
    <>
      <PageHead
        title="Reports"
        eyebrow="Saved records, explained"
        actions={
          <button
            className="button secondary"
            disabled={!valid || !online || query.isFetching}
            onClick={() => void query.refetch()}
          >
            Refresh report
          </button>
        }
      >
        Review bookings and money with their source records.
      </PageHead>
      <form
        key={params.toString()}
        className="panel report-filters"
        aria-label="Report filters"
        onSubmit={(event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          const next = Object.fromEntries(
            ["kind", "from", "to", "room"].map((key) => [
              key,
              String(fields.get(key) ?? ""),
            ]),
          );
          if (!validPeriod(next.from, next.to)) {
            setFilterError(
              "Choose a valid period of 1 to 366 days. The end date is excluded.",
            );
            return;
          }
          setFilterError("");
          setParams(next);
        }}
      >
        <SelectField name="kind" label="Report" defaultValue={kind}>
          {!kinds.includes(kind as Kind) && (
            <option value={kind}>Choose a valid report</option>
          )}
          {kinds.map((value) => (
            <option key={value} value={value}>
              {reportLabel(value)}
            </option>
          ))}
        </SelectField>
        <Field
          name="from"
          label="Start date, included"
          type="date"
          required
          defaultValue={from}
        />
        <Field
          name="to"
          label="End date, excluded"
          type="date"
          required
          defaultValue={to}
        />
        <RoomFilter initial={room} rooms={rooms} />
        <button className="button" type="submit">
          Apply filters
        </button>
        {choices.hasNextPage && (
          <button
            className="button quiet"
            type="button"
            disabled={choices.isFetchingNextPage || !online}
            onClick={() => void choices.fetchNextPage()}
          >
            Load more room choices
          </button>
        )}
      </form>
      {choices.isError && (
        <Notice>
          Room choices could not be loaded. Your selected report still uses its
          stated room filter.
        </Notice>
      )}
      {filterError && <Notice error>{filterError}</Notice>}
      {!valid ? (
        <Notice error>
          The report filters are invalid. Choose a report, valid room and period
          of up to 366 days.
        </Notice>
      ) : query.isPending ? (
        <Pending label="Reconciling report sources…" />
      ) : query.isError && !data ? (
        <Notice error>
          {query.error.message ===
          "The result could not be confirmed. Check the saved records before retrying."
            ? "The report could not be loaded or verified. Refresh it and try again."
            : query.error.message}
        </Notice>
      ) : null}
      {data && (
        <>
          {(!online || query.isError) && (
            <Notice error>
              This report is previously loaded data. Refresh successfully before
              downloading or relying on its totals.
            </Notice>
          )}
          <ReportResults
            key={data.snapshotId}
            report={data}
            downloadEnabled={
              online && !query.isFetching && !query.isError && !query.isPaused
            }
          />
        </>
      )}
    </>
  );
}

function ReportResults({
  report: r,
  downloadEnabled,
}: {
  report: Report;
  downloadEnabled: boolean;
}) {
  const [visible, setVisible] = useState(25);
  const count =
    r.occupancy.length +
    r.charges.length +
    r.collections.length +
    r.balances.length;
  return (
    <>
      <section
        className="panel report-explanation"
        aria-labelledby="report-heading"
      >
        <h2 id="report-heading">{reportLabel(r.kind)}</h2>
        <p>
          {dateLabel(r.startDate)} to {dateLabel(r.endDate)}, end date excluded
          · {r.roomId ? `Room #${r.roomId}` : "All rooms"} · EUR
        </p>
        <p>{definition(r.kind)}</p>
        <p className="hint">
          Current corrected records · Property day {dateLabel(r.propertyDate)} ·
          Complete report contains {count} source rows.
        </p>
        <Download report={r} enabled={downloadEnabled} />
      </section>
      {r.notices.map((notice) => (
        <Notice key={notice} error={notice === "INVENTORY_CONFLICT"}>
          {noticeLabel(notice)}
        </Notice>
      ))}
      <Summary report={r} />
      {count === 0 ? (
        <Empty headingLevel={2} title="No matching source records">
          There are no matching records for these filters. Setup and
          completeness notices above still apply.
        </Empty>
      ) : (
        <section className="panel report-sources">
          <h2>Source records</h2>
          <p className="hint">
            Showing {Math.min(visible, count)} of {count}. CSV includes every
            source row.
          </p>
          {r.kind === "OCCUPANCY" && (
            <Table
              label="Room-night sources"
              headings={[
                "Room",
                "Current roster",
                "Gross nights",
                "Blocked",
                "Sellable",
                "Booked",
                "Sources",
              ]}
            >
              {r.occupancy.slice(0, visible).map((row) => (
                <tr key={row.roomId}>
                  <td>
                    <Link to={`/rooms/${row.roomId}`}>
                      {row.roomName} · {row.roomReference}
                    </Link>
                  </td>
                  <td>
                    {row.active ? "Active" : "Archived, excluded from totals"}
                  </td>
                  <td>{row.roomNights}</td>
                  <td>{row.blockedNights}</td>
                  <td>{row.sellableNights}</td>
                  <td>{row.bookedNights}</td>
                  <td>
                    <Link
                      to={`/reports?kind=CHARGES&from=${r.startDate}&to=${r.endDate}&room=${row.roomId}`}
                    >
                      Booking nights and charges
                    </Link>
                    <br />
                    <Link to={`/calendar?from=${r.startDate}`}>
                      Room calendar and maintenance
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
          )}
          {r.kind === "CHARGES" && (
            <Table
              label="Booked charge sources"
              headings={[
                "Booking",
                "Room",
                "Status",
                "Night dates",
                "Nights",
                "Booked charge",
              ]}
            >
              {r.charges.slice(0, visible).map((row) => (
                <tr key={`${row.reservationId}:${row.roomId}:${row.startDate}`}>
                  <td>
                    <Link to={`/reservations/${row.reservationId}`}>
                      {row.guestName} · #{row.reservationId}
                    </Link>
                  </td>
                  <td>
                    <Link to={`/rooms/${row.roomId}`}>
                      {row.roomName} · {row.roomReference}
                    </Link>
                  </td>
                  <td>{phaseLabel(row.phase)}</td>
                  <td>
                    {dateLabel(row.startDate)} to {dateLabel(row.endDate)}
                  </td>
                  <td>{row.nights}</td>
                  <td>{money(row.chargeCents)}</td>
                </tr>
              ))}
            </Table>
          )}
          {r.kind === "COLLECTIONS" && (
            <Table
              label="Collection ledger sources"
              headings={[
                "Ledger source",
                "Effective date",
                "Record",
                "Original amount",
                "Collected",
                "Refunded",
              ]}
            >
              {r.collections.slice(0, visible).map((row) => (
                <tr key={row.entryId}>
                  <td>
                    <Link to={`/reservations/${row.reservationId}#payments`}>
                      {row.guestName} · Booking #{row.reservationId} · Entry #
                      {row.entryId}
                    </Link>
                  </td>
                  <td>{dateLabel(row.effectiveDate)}</td>
                  <td>
                    {row.kind === "REVERSAL"
                      ? "Correction"
                      : row.kind === "REFUND"
                        ? "Refund"
                        : "Receipt"}{" "}
                    · {methodLabel(row.method ?? null)}
                    {row.reference && <p className="hint">{row.reference}</p>}
                    {row.reversedById && (
                      <p>Corrected by entry #{row.reversedById}</p>
                    )}
                    {row.reversesId && <p>Corrects entry #{row.reversesId}</p>}
                    {row.paymentId && <p>From receipt #{row.paymentId}</p>}
                  </td>
                  <td>{euros(row.amountCents)}</td>
                  <td>{euros(row.collectedCents)}</td>
                  <td>{euros(row.refundedCents)}</td>
                </tr>
              ))}
            </Table>
          )}
          {r.kind === "BALANCES" && (
            <Table
              label="Current booking balances"
              headings={[
                "Booking",
                "Stay dates",
                "Status",
                "Accommodation owed",
                "Net received",
                "Outstanding",
                "Credit",
              ]}
            >
              {r.balances.slice(0, visible).map((row) => (
                <tr key={row.reservationId}>
                  <td>
                    <Link to={`/reservations/${row.reservationId}#payments`}>
                      {row.guestName} · #{row.reservationId}
                    </Link>
                  </td>
                  <td>
                    {dateLabel(row.startDate)} to {dateLabel(row.endDate)}
                  </td>
                  <td>{phaseLabel(row.phase)}</td>
                  <td>{money(row.accommodationCents)}</td>
                  <td>{euros(row.receivedCents)}</td>
                  <td>{money(row.outstandingCents)}</td>
                  <td>{money(row.creditCents)}</td>
                </tr>
              ))}
            </Table>
          )}
          {visible < count && (
            <button
              className="button secondary"
              onClick={() => setVisible((n) => n + 25)}
            >
              Show more source rows
            </button>
          )}
        </section>
      )}
    </>
  );
}
function Summary({ report: r }: { report: Report }) {
  const t = r.totals;
  const cards =
    r.kind === "OCCUPANCY"
      ? [
          [
            "Booked occupancy",
            !t.sellableNights || r.notices.includes("INVENTORY_CONFLICT")
              ? "Unavailable"
              : `${((t.bookedNights / t.sellableNights) * 100).toFixed(1)}%`,
          ],
          ["Booked nights, active rooms", String(t.bookedNights)],
          ["Sellable room nights", String(t.sellableNights)],
          ["Blocked room nights", String(t.blockedNights)],
        ]
      : r.kind === "CHARGES"
        ? [
            ["Complete booked charges", money(t.chargeCents)],
            ["Known charge subtotal", euros(t.knownChargeCents)],
            ["Bookings with unknown prices", String(t.unknownPriceCount)],
          ]
        : r.kind === "COLLECTIONS"
          ? [
              ["Corrected receipts", euros(t.collectedCents)],
              ["Corrected refunds", euros(t.refundedCents)],
              ["Net collected", euros(t.netCollectedCents)],
            ]
          : [
              ["Complete outstanding", money(t.outstandingCents)],
              ["Known outstanding subtotal", euros(t.knownOutstandingCents)],
              ["Complete credit", money(t.creditCents)],
              ["Known credit subtotal", euros(t.knownCreditCents)],
              ["Bookings with unknown prices", String(t.unknownPriceCount)],
            ];
  return (
    <dl className="report-totals" aria-label="Reconciled report totals">
      {cards.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RoomFilter({
  initial,
  rooms,
}: {
  initial: string;
  rooms: z.infer<typeof roomPage>["items"];
}) {
  const [value, setValue] = useState(initial);
  return (
    <SelectField
      name="room"
      label="Room"
      value={value}
      onChange={(event) => setValue(event.target.value)}
    >
      <option value="">All rooms, including archived</option>
      {value && !rooms.some((r) => r.id === Number(value)) && (
        <option value={value}>Selected room #{value}</option>
      )}
      {rooms.map((r) => (
        <option key={r.id} value={r.id}>
          {roomChoiceLabel(r)}
          {r.active ? "" : " · Archived"}
        </option>
      ))}
    </SelectField>
  );
}
