import { useQuery, useQueryClient } from "@tanstack/react-query";
import { me } from "./auth";

export function useAuth() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        return (await me()).user;
      } catch {
        return null; // 401 = não autenticado, não é erro de transporte
      }
    },
    staleTime: 60_000,
    retry: false,
  });

  return {
    user: query.data ?? null,
    isLoading: query.isLoading,
    refresh: () => qc.invalidateQueries({ queryKey: ["auth", "me"] }),
  };
}
