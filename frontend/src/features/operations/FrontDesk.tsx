import { Link, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../app/context";
import { dateLabel, roomChoiceLabel } from "../../shared/format";
import {
  deskLabel,
  deskLists,
  frontDeskSchema,
  phaseLabel,
  type DeskList,
} from "../../shared/operations";
import {
  Empty,
  Notice,
  PageHead,
  Pending,
  QueryError,
  SelectField,
  Table,
} from "../../shared/ui";
import { useOnline } from "../../shared/useOnline";

export function FrontDesk() {
  const { apis } = useWorkspace();
  const cache = useQueryClient();
  const online = useOnline();
  const [params, setParams] = useSearchParams();
  const list = params.get("list") ?? "ARRIVALS";
  const valid = deskLists.includes(list as DeskList);
  const query = useInfiniteQuery({
    queryKey: ["front-desk", list],
    enabled: valid,
    initialPageParam: {
      afterId: 0,
      expectedDate: undefined as string | undefined,
    },
    queryFn: async ({ signal, pageParam }) => {
      const page = frontDeskSchema.parse(
        await apis.operationsApi.frontDesk(
          { ...pageParam, list: list as DeskList, limit: 50 },
          { signal },
        ),
      );
      if (
        page.list !== list ||
        (pageParam.expectedDate &&
          page.propertyDate !== pageParam.expectedDate) ||
        page.items.some((row) => row.reservation.id <= pageParam.afterId)
      )
        throw new Error("The front-desk list could not be verified.");
      return page;
    },
    getNextPageParam: (page) =>
      page.nextCursor
        ? { afterId: page.nextCursor, expectedDate: page.propertyDate }
        : undefined,
  });
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];
  const day = query.data?.pages[0].propertyDate;
  return (
    <>
      <PageHead title="Front desk" eyebrow="Daily operations">
        Review arrivals, departures and stays that need attention.
      </PageHead>
      <section className="panel filters" aria-label="Front-desk filters">
        <SelectField
          label="Stay list"
          value={list}
          onChange={(event) => setParams({ list: event.target.value })}
        >
          {deskLists.map((value) => (
            <option key={value} value={value}>
              {deskLabel(value)}
            </option>
          ))}
        </SelectField>
        <button
          className="button secondary"
          disabled={query.isFetching || !online}
          onClick={() =>
            void cache.resetQueries({
              queryKey: ["front-desk", list],
              exact: true,
            })
          }
        >
          Refresh day
        </button>
      </section>
      {day && (
        <p className="hint">Property day {dateLabel(day)} · Europe/Skopje</p>
      )}
      {!valid ? (
        <Notice error>
          This stay-list filter is invalid. Choose a list above.
        </Notice>
      ) : query.isPending ? (
        <Pending />
      ) : query.isError && !query.data ? (
        <QueryError retry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <Empty headingLevel={2} title="No matching stays">
          This list has no stays for the current property day.
        </Empty>
      ) : (
        <section className="panel">
          <Table
            label="Front-desk stays"
            headings={["Guest", "Room", "Stay dates", "Status", ""]}
          >
            {rows.map(({ reservation: stay, ...row }) => (
              <tr key={stay.id}>
                <td>{row.guestName}</td>
                <td>
                  {roomChoiceLabel({
                    id: stay.roomId,
                    name: row.roomName,
                    reference: row.roomReference,
                  })}
                </td>
                <td>
                  {dateLabel(stay.startDate)} to {dateLabel(stay.endDate)}
                </td>
                <td>
                  <span className={`status status-${stay.phase.toLowerCase()}`}>
                    {phaseLabel(stay.phase)}
                  </span>
                </td>
                <td>
                  <Link
                    className="button secondary"
                    to={`/reservations/${stay.id}`}
                  >
                    Open stay #{stay.id}
                  </Link>
                </td>
              </tr>
            ))}
          </Table>
        </section>
      )}
      {query.isError && query.data && (
        <Notice error>
          The list could not be refreshed. A new property day requires a fresh
          first page.
        </Notice>
      )}
      {query.hasNextPage && (
        <button
          className="button secondary"
          disabled={query.isFetchingNextPage || !online}
          onClick={() => void query.fetchNextPage()}
        >
          Load more stays
        </button>
      )}
    </>
  );
}
