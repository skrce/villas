import { useRooms } from "./queries";
import { roomLabel } from "../../shared/format";
import { Empty, PageHead, Pending, QueryError } from "../../shared/ui";
export function Rooms() {
  const rooms = useRooms();
  return (
    <>
      <PageHead title="Rooms">
        Your current room inventory and capacity.
      </PageHead>
      {rooms.isPending ? (
        <Pending />
      ) : rooms.isError ? (
        <QueryError retry={() => void rooms.refetch()} />
      ) : !rooms.data.length ? (
        <section className="panel">
          <Empty title="No rooms configured">
            Configured rooms will appear here.
          </Empty>
        </section>
      ) : (
        <ul className="room-grid">
          {rooms.data.map((room) => (
            <li key={room.id} className="room-card">
              <div className="room-illustration" aria-hidden="true">
                <svg viewBox="0 0 160 80">
                  <path d="M20 65V30h120v35M20 50h120M26 30V15h108v15M32 40h38m20 0h38" />
                </svg>
              </div>
              <div className="room-card-body">
                <span className="eyebrow">
                  {room.active === false ? "Inactive" : "In service"}
                </span>
                <h2>{roomLabel(room)}</h2>
                <p>Up to {room.capacity} guests</p>
                <p className="hint">
                  {room.orientation || "Orientation not specified"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
