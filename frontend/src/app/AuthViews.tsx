import { useEffect, useState } from "react";
import {
  logout,
  businessPrefix,
  selectBusiness,
  refreshSession,
  startSignIn,
  useStaffSession,
} from "../api/session";
export function BusinessHome() {
  const session = useStaffSession();
  const [error, setError] = useState("");
  if (session.status !== "choosing" && session.status !== "restricted")
    return null;
  return (
    <main className="page business-home">
      <section className="card">
        <p className="eyebrow">Villas staff workspace</p>
        <h1>
          {session.status === "choosing"
            ? "Choose a business"
            : "Business unavailable"}
        </h1>
        <p>{session.identityEmail}</p>
        {session.status === "restricted" && (
          <p role="alert">{session.reason}</p>
        )}
        {!session.memberships.length && (
          <p>
            No business access is available in this session. Ask an Owner for an
            invitation, then sign in again.
          </p>
        )}
        <nav aria-label="Your businesses" className="business-choices">
          {session.memberships.map((membership) => (
            <a
              className="button secondary"
              key={membership.businessId}
              href={`${businessPrefix(membership.businessId)}/today`}
              onClick={(event) => {
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                event.preventDefault();
                selectBusiness(membership.businessId);
              }}
            >
              Open {membership.businessName}
            </a>
          ))}
        </nav>
        {session.provider === "synthetic" && (
          <p role="status">Local demo: synthetic accounts and test data.</p>
        )}
        <div className="business-actions">
          <button
            className="button secondary"
            onClick={() => {
              try {
                startSignIn();
              } catch (failure) {
                setError(String(failure));
              }
            }}
          >
            Sign in
            {session.provider === "synthetic"
              ? " to local demo"
              : " with Google"}
          </button>
          <button
            className="button secondary"
            onClick={() => void refreshSession({ explicit: true })}
          >
            Check session
          </button>
          <button className="button quiet" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
        {error && (
          <p role="alert">
            {error}{" "}
            <a href="/auth/start" target="_blank" rel="noreferrer">
              Open sign-in
            </a>
          </p>
        )}
      </section>
    </main>
  );
}
export function Login() {
  const session = useStaffSession();
  const [error, setError] = useState("");
  return (
    <main className="page">
      <section className="card">
        <p className="eyebrow">Villas staff workspace</p>
        <h1>Welcome to Villas</h1>
        <p>Sign in with an invited Google account to manage your property.</p>
        {session.status !== "loading" && session.provider === "synthetic" && (
          <p role="status">Local demo: synthetic accounts and test data.</p>
        )}
        {session.status === "loading" ? (
          <p role="status">Checking your session…</p>
        ) : (
          <>
            {session.status !== "authenticated" &&
              session.reason === "expired" && (
                <p role="alert">
                  Your session expired. Sign in again, then review your entered
                  details before submitting.
                </p>
              )}
            {session.status !== "authenticated" &&
              session.reason === "logout-unconfirmed" && (
                <p role="alert">
                  Sign-out could not be confirmed. Check your session before
                  leaving this browser.
                </p>
              )}
            {(session.status === "unavailable" ||
              session.status === "restricted") && (
              <p role="alert">{session.reason}</p>
            )}
            {new URLSearchParams(window.location.search).has("error") && (
              <p role="alert">
                Sign-in was declined. Use a verified account with an unexpired
                invitation.
              </p>
            )}
            <button
              disabled={
                session.status !== "authenticated" &&
                session.reason === "logout-pending"
              }
              className="btn primary"
              onClick={() => {
                try {
                  startSignIn();
                } catch (error) {
                  setError(String(error));
                }
              }}
            >
              Sign in
              {session.provider === "synthetic"
                ? " to local demo"
                : " with Google"}
            </button>
            <button
              disabled={
                session.status !== "authenticated" &&
                session.reason === "logout-pending"
              }
              className="btn"
              onClick={() => void refreshSession({ explicit: true })}
            >
              Check session
            </button>
            {session.status === "restricted" && (
              <button className="btn" onClick={() => void logout()}>
                Sign out
              </button>
            )}
            {error && (
              <p role="alert">
                {error}{" "}
                <a href="/auth/start" target="_blank" rel="noreferrer">
                  Open sign-in
                </a>
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}

export function AuthReturn() {
  useEffect(() => {
    if (window.location.pathname === "/auth/start") {
      sessionStorage.setItem("villas.signinPopup", "yes");
      window.location.replace("/oauth2/authorization/google");
      return;
    }
    const channel =
      typeof BroadcastChannel === "undefined"
        ? undefined
        : new BroadcastChannel("villas.session");
    const completed = () => {
      if (sessionStorage.getItem("villas.signinPopup")) {
        sessionStorage.removeItem("villas.signinPopup");
        window.close();
      }
    };
    channel?.addEventListener("message", (event) => {
      if (event.data === "received") completed();
    });
    void refreshSession().then(() => {
      channel?.postMessage("signed-in");
    });
    return () => channel?.close();
  }, []);
  return (
    <main className="page">
      <h1>Sign-in complete</h1>
      <p>You can return to your Villas workspace.</p>
      <a href="/">Open workspace</a>
    </main>
  );
}
