import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ResponseError } from "../api/generated";
import { getSessionEpoch } from "../api/session";
import { useWorkspace } from "../app/context";
import { errorMessage } from "./errors";
export function useSave<T>(
  action: (input: T) => Promise<unknown>,
  after?: (result: unknown) => void,
  options: { invalidate?: boolean; onError?: (body: unknown) => void } = {},
) {
  const { epoch } = useWorkspace();
  const cache = useQueryClient();
  const [message, setMessage] = useState("");
  const [stale, setStale] = useState(false);
  const [code, setCode] = useState<string>();
  const [relatedIds, setRelatedIds] = useState<number[]>([]);
  const [moreRecords, setMoreRecords] = useState(false);
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
      setCode(undefined);
      setRelatedIds([]);
      setMoreRecords(false);
      try {
        const result = await action(input);
        if (epoch !== getSessionEpoch()) return;
        if (options.invalidate !== false) await cache.invalidateQueries();
        if (epoch === getSessionEpoch() && alive.current) after?.(result);
        return result;
      } catch (error) {
        if (error instanceof ResponseError) {
          const body = await error.response
            .clone()
            .json()
            .catch(() => null);
          if (epoch === getSessionEpoch() && alive.current) {
            options.onError?.(body);
            setCode(typeof body?.code === "string" ? body.code : undefined);
            setRelatedIds(
              Array.isArray(body?.relatedReservationIds)
                ? body.relatedReservationIds
                    .filter(
                      (id: unknown) =>
                        typeof id === "number" &&
                        Number.isSafeInteger(id) &&
                        id > 0 &&
                        id <= 2147483647,
                    )
                    .slice(0, 20)
                : [],
            );
            setMoreRecords(body?.moreReservations === true);
          }
          if (
            epoch === getSessionEpoch() &&
            alive.current &&
            ["STALE_VERSION", "RESERVATION_CHANGED"].includes(body?.code)
          )
            setStale(true);
          if (error.response.status === 409) await cache.invalidateQueries();
        }
        const text = await errorMessage(error);
        if (epoch === getSessionEpoch() && alive.current) setMessage(text);
        throw error;
      }
    },
    retry: false,
    networkMode: "always",
  });
  return {
    ...mutation,
    message,
    stale,
    code,
    relatedIds,
    moreRecords,
    resetStatus: () => {
      setStale(false);
      setMessage("");
      setCode(undefined);
      setRelatedIds([]);
      setMoreRecords(false);
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
