import { useCallback, useContext, useMemo, useState } from "react";
import { DraftContext } from "../app/context";
export function useDraft<T>(key: string, defaults: T) {
  const drafts = useContext(DraftContext);
  const [initial] = useState(() => ({
    ...defaults,
    ...(drafts?.get(key) as Partial<T> | undefined),
  }));
  const save = useCallback(
    (value: unknown) => drafts?.set(key, value),
    [drafts, key],
  );
  const clear = useCallback(() => drafts?.delete(key), [drafts, key]);
  return useMemo(() => ({ initial, save, clear }), [initial, save, clear]);
}
