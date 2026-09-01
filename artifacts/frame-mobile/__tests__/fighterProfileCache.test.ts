import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { commitFighterProfile } from "../lib/fighterProfileCache";

describe("commitFighterProfile", () => {
  it("cancels a stale user-scoped fetch before publishing the saved fighter", async () => {
    const order: string[] = [];
    const fighter = { id: 42, userId: "user-123", name: "Kilo" };
    const cancelQueries = vi.fn(async () => {
      order.push("cancel");
    });
    const setQueryData = vi.fn(() => {
      order.push("set");
      return fighter;
    });

    const queryClient = {
      cancelQueries,
      setQueryData,
    } as unknown as QueryClient;

    await commitFighterProfile(queryClient, "user-123", fighter);

    expect(cancelQueries).toHaveBeenCalledWith({
      queryKey: ["fighter", "user-123"],
      exact: true,
    });
    expect(setQueryData).toHaveBeenCalledWith(
      ["fighter", "user-123"],
      fighter,
    );
    expect(order).toEqual(["cancel", "set"]);
  });
});