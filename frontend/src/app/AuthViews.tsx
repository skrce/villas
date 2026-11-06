import { useEffect, useState } from "react";
import { refreshSession, startSignIn, useStaffSession } from "../api/session";
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
            {session.status === "unavailable" && (
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
