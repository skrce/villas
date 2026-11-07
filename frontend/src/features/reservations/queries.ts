import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReservationInfo } from "../../api/generated";
import { useWorkspace } from "../../app/context";
import { validVersion } from "../../shared/format";

export function useReservation(id: number, enabled = true) {
  const { apis } = useWorkspace();
  const cache = useQueryClient();
  return useQuery({
    queryKey: ["reservations", id],
    enabled,
    queryFn: async ({ signal }) => {
      const data = await apis.reservationApi.getReservation(
        { reservationId: id },
        { signal },
      );
      if (data.id !== id || !validVersion(data.version))
        throw new Error("The reservation could not be verified.");
      const cached = cache.getQueryData<ReservationInfo>(["reservations", id]);
      return cached &&
        validVersion(cached.version) &&
        cached.version > data.version
        ? cached
        : data;
    },
  });
}
