import { useEffect, useState } from "react";

export const ACTIVITY_WINDOW_MS = 3 * 60_000;

export function useActivity() {
  const [active, setActive] = useState(document.visibilityState !== "hidden");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const renew = () => {
      clearTimeout(timer);
      const visible = document.visibilityState !== "hidden";
      setActive(visible);
      if (visible)
        timer = setTimeout(() => setActive(false), ACTIVITY_WINDOW_MS);
    };
    const events = ["pointerdown", "keydown", "focus", "visibilitychange"];
    for (const name of events) window.addEventListener(name, renew);
    document.addEventListener("visibilitychange", renew);
    renew();
    return () => {
      clearTimeout(timer);
      for (const name of events) window.removeEventListener(name, renew);
      document.removeEventListener("visibilitychange", renew);
    };
  }, []);
  return active;
}
