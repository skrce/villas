import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useSave } from "./useSave";

vi.mock("../app/context", () => ({ useWorkspace: () => ({ epoch: 1 }) }));
vi.mock("../api/session", () => ({ getSessionEpoch: () => 1 }));

function setup(action: () => Promise<unknown>, repeatable = false) {
  const cache = new QueryClient();
  const after = vi.fn();
  const hook = renderHook(() => useSave<void>(action, after, { repeatable }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    ),
  });
  return { ...hook, after };
}
describe("final save completion", () => {
  it("blocks a second event after success while its completion callback has not removed the form", async () => {
    const action = vi.fn().mockResolvedValue(42);
    const { result, after } = setup(action);
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.isSuccess).toBe(true);
    await act(async () => {
      await result.current.submit();
    });
    expect(action).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
  });
  it("allows a deliberate retry after failure without treating it as a completed save", async () => {
    const action = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Lost result"))
      .mockResolvedValue(42);
    const { result, after } = setup(action);
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.isError).toBe(true);
    await act(async () => {
      await result.current.submit();
    });
    expect(action).toHaveBeenCalledTimes(2);
    expect(after).toHaveBeenCalledTimes(1);
  });
  it("keeps explicit quote/reload-style actions repeatable", async () => {
    const action = vi.fn().mockResolvedValue(42);
    const { result, after } = setup(action, true);
    await act(async () => {
      await result.current.submit();
    });
    await act(async () => {
      await result.current.submit();
    });
    expect(action).toHaveBeenCalledTimes(2);
    expect(after).toHaveBeenCalledTimes(2);
  });
  it("accepts a new explicitly reset intent after a confirmed save", async () => {
    const action = vi.fn().mockResolvedValue(42);
    const { result } = setup(action);
    await act(async () => {
      await result.current.submit();
    });
    act(() => result.current.resetStatus());
    await act(async () => {
      await result.current.submit();
    });
    expect(action).toHaveBeenCalledTimes(2);
  });
});
