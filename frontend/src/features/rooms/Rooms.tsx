import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useWorkspace } from "../../app/context";
import { roomLabel } from "../../shared/format";
import { useDraft } from "../../shared/useDraft";
import { RoomForm } from "./Form";
import {
  Dialog,
  Empty,
  Field,
  PageHead,
  Pending,
  QueryError,
  RecordState,
} from "../../shared/ui";

export function Rooms() {
  const { apis } = useWorkspace();
  const navigate = useNavigate();
  const draft = useDraft("room-search", { name: "", includeArchived: false });
  const [input, setInput] = useState(draft.initial);
  const [criteria, setCriteria] = useState(draft.initial);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const query = useInfiniteQuery({
    queryKey: ["rooms", "directory", criteria],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      apis.apartmentApi.apartmentDirectory(
        { ...criteria, afterId: pageParam, limit: 30 },
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const change = (value: typeof input) => {
    setInput(value);
    draft.save(value);
  };
  return (
    <>
      <PageHead
        title="Rooms"
        actions={
          <button className="button" onClick={() => setCreating(true)}>
            Add room
          </button>
        }
      >
        Manage room details, capacity and dated maintenance.
      </PageHead>
      <section className="panel">
        <form
          className="form-row"
          aria-label="Search rooms"
          onSubmit={(event) => {
            event.preventDefault();
            if (JSON.stringify(input) === JSON.stringify(criteria))
              void query.refetch();
            else setCriteria(input);
          }}
        >
          <Field
            label="Name or reference"
            autoComplete="off"
            maxLength={200}
            value={input.name}
            onChange={(event) => change({ ...input, name: event.target.value })}
          />
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={input.includeArchived}
              onChange={(event) =>
                change({ ...input, includeArchived: event.target.checked })
              }
            />
            Include archived rooms
          </label>
          <button className="button secondary" disabled={query.isFetching}>
            Search rooms
          </button>
        </form>
      </section>
      {query.isPending ? (
        <Pending />
      ) : query.isError ? (
        <QueryError retry={() => void query.refetch()} />
      ) : !items.length ? (
        <section className="panel">
          <Empty headingLevel={2} title="No rooms configured">
            Add your first room, or change the filters to find an archived room.
          </Empty>
        </section>
      ) : (
        <>
          <div className="section-heading">
            <h2>Room directory</h2>
            <span className="count">{items.length} shown</span>
          </div>
          <ul className="room-grid">
            {items.map((room) => (
              <li key={room.id} className="room-card">
                <div className="room-illustration" aria-hidden="true">
                  <svg viewBox="0 0 160 80">
                    <path d="M20 65V30h120v35M20 50h120M26 30V15h108v15M32 40h38m20 0h38" />
                  </svg>
                </div>
                <div className="room-card-body">
                  <div className="section-heading">
                    <span className="eyebrow">{room.reference || "Room"}</span>
                    <RecordState active={room.active} />
                  </div>
                  <h2>
                    <Link to={`/rooms/${room.id}`}>{roomLabel(room)}</Link>
                  </h2>
                  <p>Up to {room.capacity} guests</p>
                  <p className="hint">
                    {room.bedConfiguration || "Beds not specified"}
                  </p>
                  {room.features && <p className="hint">{room.features}</p>}
                  <Link className="text-link" to={`/rooms/${room.id}`}>
                    Room details & availability
                    <span className="sr-only"> {roomLabel(room)}</span>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {query.hasNextPage && (
        <button
          className="button secondary load-more"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? "Loading…" : "Load more rooms"}
        </button>
      )}
      {creating && (
        <Dialog title="Add room" busy={busy} onClose={() => setCreating(false)}>
          <RoomForm
            onPending={setBusy}
            onSaved={(id) => navigate(`/rooms/${id}`)}
          />
        </Dialog>
      )}
    </>
  );
}
