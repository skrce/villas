import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ResponseError } from "../api/generated";
import { getSessionEpoch } from "../api/session";
import { useWorkspace } from "../app/context";
import { errorMessage } from "./errors";
export function useSave<T>(
  action: (input: T) => Promise<unknown>,
  after?: (result: unknown) => void,
) {
  const { epoch } = useWorkspace();
  const cache = useQueryClient();
  const [message, setMessage] = useState("");
  const [stale, setStale] = useState(false);
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const mutation = useMutation({
    mutationFn: async (input: T) => {
      setMessage("");
      setStale(false);
      try {
        const result = await action(input);
        if (epoch !== getSessionEpoch()) return;
        await cache.invalidateQueries();
        if (epoch === getSessionEpoch() && alive.current) after?.(result);
        return result;
      } catch (error) {
        if (error instanceof ResponseError && error.response.status === 409) {
          const body = await error.response
            .clone()
            .json()
            .catch(() => null);
          if (
            epoch === getSessionEpoch() &&
            ["STALE_VERSION", "RESERVATION_CHANGED"].includes(body?.code)
          )
            setStale(true);
          await cache.invalidateQueries();
        }
        const text = await errorMessage(error);
        if (epoch === getSessionEpoch() && alive.current) setMessage(text);
        throw error;
      }
    },
    retry: false,
  });
  return {
    ...mutation,
    message,
    stale,
    resetStatus: () => {
      setStale(false);
      setMessage("");
      mutation.reset();
    },
    submit: async (input: T) => {
      if (pending.current) return;
      pending.current = true;
      try {
        await mutation.mutateAsync(input).catch(() => undefined);
      } finally {
        pending.current = false;
      }
    },
  };
}
