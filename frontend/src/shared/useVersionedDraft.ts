import { useCallback, useMemo, useRef, useState } from "react";
import { useDraft } from "./useDraft";
import { validVersion } from "./format";

export function useVersionedDraft<T extends object>(
  key: string,
  defaults: T,
  currentVersion?: number,
) {
  const raw = useDraft(key, {
    ...defaults,
    expectedVersion: validVersion(currentVersion) ? currentVersion : -1,
  });
  const [expectedVersion, setVersion] = useState(raw.initial.expectedVersion);
  const versionRef = useRef(expectedVersion);
  const save = useCallback(
    (value: T) => raw.save({ ...value, expectedVersion: versionRef.current }),
    [raw],
  );
  const reload = useCallback(
    (value: T, version?: number) => {
      if (!validVersion(version)) return;
      versionRef.current = version;
      raw.save({ ...value, expectedVersion: version });
      setVersion(version);
    },
    [raw],
  );
  return useMemo(
    () => ({
      initial: raw.initial,
      expectedVersion,
      changed:
        !validVersion(currentVersion) || expectedVersion !== currentVersion,
      save,
      reload,
      clear: raw.clear,
    }),
    [raw, expectedVersion, currentVersion, save, reload],
  );
}
