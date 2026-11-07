import {
  Fragment,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { buildApis } from "../api/client";
import { buildBookingActions } from "../api/bookingActions";
import {
  API_BASE,
  getSessionEpoch,
  getSessionOwnerKey,
  logout,
  useStaffSession,
} from "../api/session";
import { Login } from "./AuthViews";
import { DraftContext, WorkspaceContext } from "./context";
import { PageHead, Pending } from "../shared/ui";

const Calendar = lazy(() =>
  import("../features/reservations/Calendar").then((module) => ({
    default: module.BookingCalendar,
  })),
);
const Reservations = lazy(() =>
  import("../features/reservations/List").then((module) => ({
    default: module.Reservations,
  })),
);
const NewReservation = lazy(() =>
  import("../features/reservations/New").then((module) => ({
    default: module.NewReservation,
  })),
);
const ReservationDetail = lazy(() =>
  import("../features/reservations/Detail").then((module) => ({
    default: module.ReservationDetail,
  })),
);
const Guests = lazy(() =>
  import("../features/guests/List").then((module) => ({
    default: module.Guests,
  })),
);
const GuestDetail = lazy(() =>
  import("../features/guests/Detail").then((module) => ({
    default: module.GuestDetail,
  })),
);
const Rooms = lazy(() =>
  import("../features/rooms/Rooms").then((module) => ({
    default: module.Rooms,
  })),
);
const RoomDetail = lazy(() =>
  import("../features/rooms/Detail").then((module) => ({
    default: module.RoomDetail,
  })),
);
const Staff = lazy(() =>
  import("../features/staff/Staff").then((module) => ({
    default: module.Staff,
  })),
);

export default function Workspace() {
  const session = useStaffSession();
  const epoch = getSessionEpoch();
  const [ownerId] = useState(getSessionOwnerKey);
  const [drafts] = useState(() => new Map<string, unknown>());
  const cache = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            meta: { sessionEpoch: epoch },
            retry: false,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
          mutations: { retry: false },
        },
      }),
    [epoch],
  );
  const context = useMemo(() => {
    const apis = buildApis(ownerId, epoch);
    return {
      apis,
      ownerId,
      epoch,
      booking: buildBookingActions(
        apis.reservationApi,
        JSON.stringify([API_BASE, ownerId]),
        String(epoch),
        apis.maintenanceApi,
        apis.apartmentApi,
        apis.quotesApi,
        { payments: apis.paymentsApi, actorId: ownerId },
      ),
    };
  }, [ownerId, epoch]);
  useEffect(() => () => drafts.clear(), [drafts]);
  const signedOut =
    session.status === "anonymous" && session.reason?.startsWith("logout");
  useEffect(() => {
    if (signedOut) drafts.clear();
  }, [drafts, signedOut]);
  useEffect(
    () => () => {
      void cache.cancelQueries();
      cache.clear();
    },
    [cache],
  );
  if (session.status !== "authenticated") return <Login />;
  if (session.staff.id !== ownerId)
    return <Pending label="Changing account…" />;
  const routes = [
    { to: "/calendar", name: "Calendar", icon: "▦" },
    { to: "/reservations", name: "Reservations", icon: "▤" },
    { to: "/guests", name: "Guests", icon: "♧" },
    { to: "/rooms", name: "Rooms", icon: "▥" },
    ...(session.permissions.includes("staff:manage")
      ? [{ to: "/settings/staff", name: "Owner settings", icon: "⚙" }]
      : []),
  ];
  return (
    <QueryClientProvider key={epoch} client={cache}>
      <WorkspaceContext.Provider value={context}>
        <DraftContext.Provider value={drafts}>
          <div className="workspace">
            <a className="skip-link" href="#main">
              Skip to content
            </a>
            <aside className="sidebar">
              <NavLink to="/calendar" className="brand">
                <span className="brand-mark" aria-hidden="true">
                  V
                </span>
                <span>
                  Villas<small>Villa Rosa</small>
                </span>
              </NavLink>
              <p className="nav-label">Workspace</p>
              <nav aria-label="Main navigation">
                {routes.map((route) => (
                  <NavLink key={route.to} to={route.to}>
                    <span aria-hidden="true">{route.icon}</span>
                    {route.name}
                  </NavLink>
                ))}
              </nav>
              <div className="property-note">
                <span className="online-dot" aria-hidden="true" /> North
                Macedonia<p>Property time · Skopje</p>
              </div>
            </aside>
            <div className="workspace-body">
              <header className="topbar">
                <span>Staff workspace</span>
                <div className="account">
                  <span className="avatar" aria-hidden="true">
                    O
                  </span>
                  <div>
                    <strong>Owner</strong>
                    <span className="account-email">{session.staff.email}</span>
                  </div>
                  <button
                    className="button quiet"
                    onClick={() => void logout()}
                  >
                    Sign out
                  </button>
                </div>
              </header>
              {session.provider === "synthetic" && (
                <section className="demo-banner" aria-label="Local demo">
                  Local demo · Synthetic accounts and test data
                </section>
              )}
              <RouteContent>
                <Suspense fallback={<Pending label="Opening page…" />}>
                  <Routes>
                    <Route
                      path="/"
                      element={<Navigate replace to="/calendar" />}
                    />
                    <Route
                      path="/login"
                      element={<Navigate replace to="/calendar" />}
                    />
                    <Route path="/calendar" element={<Calendar />} />
                    <Route path="/reservations" element={<Reservations />} />
                    <Route
                      path="/reservations/new"
                      element={<NewReservation />}
                    />
                    <Route
                      path="/reservations/:reservationId"
                      element={<ReservationDetail />}
                    />
                    <Route path="/guests" element={<Guests />} />
                    <Route path="/guests/:guestId" element={<GuestDetail />} />
                    <Route path="/rooms" element={<Rooms />} />
                    <Route path="/rooms/:roomId" element={<RoomDetail />} />
                    {session.permissions.includes("staff:manage") && (
                      <Route path="/settings/staff" element={<Staff />} />
                    )}
                    <Route
                      path="*"
                      element={
                        <>
                          <PageHead title="Page not found">
                            This address does not match a page in your
                            workspace.
                          </PageHead>
                          <NavLink className="button" to="/reservations">
                            Go to reservations
                          </NavLink>
                        </>
                      }
                    />
                  </Routes>
                </Suspense>
              </RouteContent>
              <footer>Villa Rosa · Europe/Skopje</footer>
            </div>
          </div>
        </DraftContext.Provider>
      </WorkspaceContext.Provider>
    </QueryClientProvider>
  );
}
function RouteContent({ children }: { children: React.ReactNode }) {
  const { pathname, search } = useLocation();
  const pageIdentity =
    pathname === "/reservations/new"
      ? JSON.stringify([
          pathname,
          ...["guest", "room", "from", "to"].map((key) =>
            new URLSearchParams(search).get(key),
          ),
        ])
      : pathname;
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    main.current?.focus();
    document.title = `${pathname.startsWith("/calendar") ? "Calendar" : pathname.startsWith("/settings") ? "Owner settings" : pathname.startsWith("/guests") ? "Guests" : pathname.startsWith("/rooms") ? "Rooms" : "Reservations"} · Villas`;
  }, [pathname, pageIdentity]);
  return (
    <main ref={main} tabIndex={-1} id="main" className="main-content">
      <Fragment key={pageIdentity}>{children}</Fragment>
    </main>
  );
}
