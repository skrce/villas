import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ACTIVITY_WINDOW_MS, useActivity } from "./useActivity";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("pauses after inactivity and resumes only on interaction or focus", () => {
  vi.useFakeTimers();
  const hook = renderHook(() => useActivity());
  expect(hook.result.current).toBe(true);
  act(() => vi.advanceTimersByTime(ACTIVITY_WINDOW_MS));
  expect(hook.result.current).toBe(false);
  act(() => window.dispatchEvent(new Event("pointerdown")));
  expect(hook.result.current).toBe(true);
  act(() => vi.advanceTimersByTime(ACTIVITY_WINDOW_MS - 1));
  expect(hook.result.current).toBe(true);
  act(() => window.dispatchEvent(new Event("keydown")));
  act(() => vi.advanceTimersByTime(ACTIVITY_WINDOW_MS));
  expect(hook.result.current).toBe(false);
  act(() => window.dispatchEvent(new Event("focus")));
  expect(hook.result.current).toBe(true);
  hook.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("pauses immediately when hidden and resumes on return", () => {
  vi.useFakeTimers();
  const visibility = vi.spyOn(document, "visibilityState", "get");
  visibility.mockReturnValue("visible");
  const hook = renderHook(() => useActivity());
  visibility.mockReturnValue("hidden");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(hook.result.current).toBe(false);
  act(() => window.dispatchEvent(new Event("pointerdown")));
  expect(hook.result.current).toBe(false);
  visibility.mockReturnValue("visible");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(hook.result.current).toBe(true);
});
