import type { QueryClient } from "@tanstack/react-query";

type FighterCacheClient = Pick<QueryClient, "cancelQueries" | "setQueryData">;

export async function commitFighterProfile<T>(
  queryClient: FighterCacheClient,
  userId: string,
  fighter: T,
): Promise<void> {
  const queryKey = ["fighter", userId] as const;
  await queryClient.cancelQueries({ queryKey, exact: true });
  queryClient.setQueryData(queryKey, fighter);
}