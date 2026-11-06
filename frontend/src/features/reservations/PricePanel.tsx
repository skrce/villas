import { useState } from "react";
import { Link } from "react-router-dom";
import { useRooms } from "../rooms/queries";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { ReservationInfo } from "../../api/generated";
import { useWorkspace } from "../../app/context";
import {
  dateLabel,
  eventLabel,
  roomChoiceLabel,
  validVersion,
} from "../../shared/format";
import { Empty, Pending, QueryError } from "../../shared/ui";
import { PriceSummary } from "./PriceSummary";
import {
  acceptedPriceSchema,
  matchesQuote,
  type AcceptedPriceData,
} from "../../shared/pricing";

export function ReservationPricePanel({
  reservation,
}: {
  reservation: ReservationInfo;
}) {
  const { apis } = useWorkspace();
  const [showHistory, setShowHistory] = useState(false);
  const rooms = useRooms();
  const roomName = (id: number) =>
    roomChoiceLabel(rooms.data?.find((room) => room.id === id) ?? { id });
  const id = reservation.id!;
  const current = useQuery({
    queryKey: [
      "accepted-price",
      id,
      reservation.acceptedQuoteId ?? "unrecorded",
    ],
    queryFn: async ({ signal }) => {
      const result = await apis.quotesApi.reservationPrice(
        { reservationId: id },
        { signal },
      );
      if (
        result.recorded === false &&
        result.price == null &&
        !reservation.acceptedQuoteId
      )
        return null;
      const checked = acceptedPriceSchema.safeParse(result.price);
      if (
        result.recorded !== true ||
        !checked.success ||
        checked.data.reservationId !== id ||
        checked.data.quote.id !== reservation.acceptedQuoteId ||
        !validVersion(reservation.version) ||
        checked.data.reservationVersion > reservation.version ||
        !matchesQuote(checked.data.quote, {
          customerId: reservation.customerId!,
          roomId: reservation.roomId!,
          startDate: reservation.startDate!,
          endDate: reservation.endDate!,
          guestCount: reservation.guestCount,
        })
      )
        throw new Error("The accepted price could not be confirmed.");
      return checked.data;
    },
  });
  const history = useInfiniteQuery({
    queryKey: ["price-history", id],
    initialPageParam: null as number | null,
    enabled: showHistory,
    queryFn: async ({ pageParam, signal }) => {
      const result = await apis.quotesApi.reservationPriceHistory(
        { reservationId: id, beforeVersion: pageParam ?? undefined, limit: 20 },
        { signal },
      );
      if (!Array.isArray(result.items))
        throw new Error("Price history could not be confirmed.");
      const items = result.items.map((value) =>
        acceptedPriceSchema.parse(value),
      );
      if (
        items.some(
          (value, index) =>
            value.reservationId !== id ||
            !validVersion(reservation.version) ||
            value.reservationVersion > reservation.version ||
            (pageParam !== null && value.reservationVersion >= pageParam) ||
            (index > 0 &&
              value.reservationVersion >= items[index - 1].reservationVersion),
        )
      )
        throw new Error("Price history could not be confirmed.");
      const next = result.nextCursor ?? null;
      if (
        next !== null &&
        (!validVersion(next) ||
          next !== items.at(-1)?.reservationVersion ||
          (pageParam !== null && next >= pageParam))
      )
        throw new Error("Price history could not be confirmed.");
      return { items, nextCursor: next };
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Agreed accommodation price</h2>
        <button
          className="button quiet"
          aria-expanded={showHistory}
          onClick={() => setShowHistory((value) => !value)}
        >
          {showHistory ? "Hide price history" : "Price history"}
        </button>
      </div>
      {current.isPending ? (
        <Pending />
      ) : current.isError ? (
        <QueryError retry={() => void current.refetch()} />
      ) : current.data === null ? (
        <Empty title="Price not recorded">
          No accommodation price was recorded for this reservation.
        </Empty>
      ) : (
        <AcceptedSummary
          price={current.data}
          roomName={roomName(current.data.quote.roomId)}
        />
      )}
      {showHistory && (
        <section className="price-history">
          <h3>Accepted price history</h3>
          {history.isPending ? (
            <Pending />
          ) : history.isError ? (
            <QueryError retry={() => void history.refetch()} />
          ) : !history.data.pages.some((page) => page.items.length) ? (
            <p className="hint">No accepted prices were recorded.</p>
          ) : (
            <ol className="price-agreements">
              {history.data.pages
                .flatMap((page) => page.items)
                .map((price) => (
                  <li key={price.quote.id}>
                    <p className="eyebrow">
                      {price.quote.id === reservation.acceptedQuoteId
                        ? "Current agreement"
                        : "Previous agreement"}
                    </p>
                    <AcceptedSummary
                      price={price}
                      roomName={roomName(price.quote.roomId)}
                    />
                  </li>
                ))}
            </ol>
          )}
          {history.hasNextPage && (
            <button
              className="button secondary"
              disabled={history.isFetchingNextPage}
              onClick={() => void history.fetchNextPage()}
            >
              Load earlier prices
            </button>
          )}
        </section>
      )}
    </section>
  );
}
function AcceptedSummary({
  price,
  roomName,
}: {
  price: AcceptedPriceData;
  roomName: string;
}) {
  return (
    <>
      <p className="hint">
        Agreed {eventLabel(price.acceptedAt)} in Skopje time.
      </p>
      <p className="hint">
        {dateLabel(price.quote.startDate)} → {dateLabel(price.quote.endDate)} ·{" "}
        {price.quote.guestCount}{" "}
        {price.quote.guestCount === 1 ? "guest" : "guests"} ·{" "}
        <Link to={`/rooms/${price.quote.roomId}`}>{roomName}</Link>
      </p>
      <PriceSummary price={price.quote.price} />
    </>
  );
}
