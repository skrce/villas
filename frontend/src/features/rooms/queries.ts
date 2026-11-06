import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "../../app/context";
export function useRooms() {
  const { apis } = useWorkspace();
  return useQuery({
    queryKey: ["rooms"],
    queryFn: ({ signal }) => apis.apartmentApi.listApartments({ signal }),
  });
}
