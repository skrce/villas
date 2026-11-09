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
  BrowserRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import {
  hashKey,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { buildApis } from "../api/client";
import { buildBookingActions } from "../api/bookingActions";
import {
  API_BASE,
  getSessionEpoch,
  assertWorkspaceCurrent,
  businessPrefix,
  legacyOperationScope,
  workspaceScope,
  type SessionState,
  logout,
  useStaffSession,
} from "../api/session";
import { BusinessHome, Login } from "./AuthViews";
import { DraftContext, WorkspaceContext } from "./context";
import { BusinessSwitcher } from "./BusinessSwitcher";
import { PageHead, Pending } from "../shared/ui";

const Calendar = lazy(() =>
  import("../features/reservations/Calendar").then((module) => ({
    default: module.BookingCalendar,
  })),
);
const Today = lazy(() =>
  import("../features/reports/Today").then((module) => ({
    default: module.Today,
  })),
);
const Reports = lazy(() =>
  import("../features/reports/Reports").then((module) => ({
    default: module.Reports,
  })),
);
const FrontDesk = lazy(() =>
  import("../features/operations/FrontDesk").then((module) => ({
    default: module.FrontDesk,
  })),
);
const Housekeeping = lazy(() =>
  import("../features/operations/Housekeeping").then((module) => ({
    default: module.Housekeeping,
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
  const [businessDrafts] = useState(
    () => new Map<string, Map<string, unknown>>(),
  );
  useEffect(() => () => businessDrafts.clear(), [businessDrafts]);
  useEffect(() => {
    if (session.status === "anonymous" && session.reason?.startsWith("logout"))
      businessDrafts.clear();
  }, [session, businessDrafts]);
  if (session.status === "choosing" || session.status === "restricted")
    return <BusinessHome />;
  if (session.status !== "authenticated") return <Login />;
  const scope = workspaceScope(
    session.identityId,
    session.propertyId,
    session.staff.id,
  );
  let drafts = businessDrafts.get(scope);
  if (!drafts) {
    drafts = new Map<string, unknown>();
    businessDrafts.set(scope, drafts);
  }
  return (
    <BrowserRouter
      key={session.propertyId}
      basename={businessPrefix(session.propertyId)}
    >
      <ActiveWorkspace
        key={`${scope}:${getSessionEpoch()}`}
        session={session}
        drafts={drafts}
      />
    </BrowserRouter>
  );
}
function ActiveWorkspace({
  session,
  drafts,
}: {
  session: Extract<SessionState, { status: "authenticated" }>;
  drafts: Map<string, unknown>;
}) {
  const epoch = getSessionEpoch();
  const ownerId = session.staff.id;
  const businessId = session.propertyId;
  const scope = workspaceScope(session.identityId, businessId, ownerId);
  const cache = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            meta: { sessionEpoch: epoch, businessId, actorId: ownerId },
            queryKeyHashFn: (key) => hashKey([scope, ...key]),
            retry: false,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
          mutations: { retry: false },
        },
      }),
    [epoch, businessId, ownerId, scope],
  );
  const context = useMemo(() => {
    const apis = buildApis(ownerId, epoch, businessId);
    return {
      apis,
      ownerId,
      businessId,
      businessName: session.propertyName,
      epoch,
      booking: buildBookingActions(
        apis.reservationApi,
        JSON.stringify([API_BASE, scope]),
        String(epoch),
        apis.maintenanceApi,
        apis.apartmentApi,
        apis.quotesApi,
        {
          payments: apis.paymentsApi,
          operations: apis.operationsApi,
          actorId: ownerId,
          assertCurrent: () =>
            assertWorkspaceCurrent(epoch, businessId, ownerId),
          legacyScope: legacyOperationScope(),
        },
      ),
    };
  }, [ownerId, businessId, epoch, scope, session.propertyName]);
  useEffect(
    () => () => {
      void cache.cancelQueries();
      cache.clear();
    },
    [cache],
  );
  const routes = [
    { to: "/today", name: "Today", icon: "⌂" },
    { to: "/calendar", name: "Calendar", icon: "▦" },
    { to: "/front-desk", name: "Front desk", icon: "⌂" },
    { to: "/reservations", name: "Reservations", icon: "▤" },
    { to: "/guests", name: "Guests", icon: "♧" },
    { to: "/rooms", name: "Rooms", icon: "▥" },
    { to: "/housekeeping", name: "Housekeeping", icon: "✓" },
    { to: "/reports", name: "Reports", icon: "▥" },
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
              <NavLink to="/today" className="brand">
                <span className="brand-mark" aria-hidden="true">
                  V
                </span>
                <span>
                  Villas<small>{session.propertyName}</small>
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
                <BusinessSwitcher />
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
              <RouteContent businessName={session.propertyName}>
                <Suspense fallback={<Pending label="Opening page…" />}>
                  <Routes>
                    <Route
                      path="/"
                      element={<Navigate replace to="/today" />}
                    />
                    <Route
                      path="/login"
                      element={<Navigate replace to="/today" />}
                    />
                    <Route path="/calendar" element={<Calendar />} />
                    <Route path="/today" element={<Today />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/front-desk" element={<FrontDesk />} />
                    <Route path="/housekeeping" element={<Housekeeping />} />
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
              <footer>{session.propertyName} · Europe/Skopje</footer>
            </div>
          </div>
        </DraftContext.Provider>
      </WorkspaceContext.Provider>
    </QueryClientProvider>
  );
}
function RouteContent({
  children,
  businessName,
}: {
  children: React.ReactNode;
  businessName: string;
}) {
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
    document.title = `${pathname.startsWith("/today") ? "Today" : pathname.startsWith("/reports") ? "Reports" : pathname.startsWith("/front-desk") ? "Front desk" : pathname.startsWith("/housekeeping") ? "Housekeeping" : pathname.startsWith("/calendar") ? "Calendar" : pathname.startsWith("/settings") ? "Owner settings" : pathname.startsWith("/guests") ? "Guests" : pathname.startsWith("/rooms") ? "Rooms" : "Reservations"} · ${businessName} · Villas`;
  }, [pathname, pageIdentity, businessName]);
  return (
    <main ref={main} tabIndex={-1} id="main" className="main-content">
      <Fragment key={pageIdentity}>{children}</Fragment>
    </main>
  );
}
