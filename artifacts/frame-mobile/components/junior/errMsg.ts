import { ApiError } from "@/lib/api";
import { juniorErrorCopy } from "@/lib/junior";

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) return juniorErrorCopy(e.code, e.message);
  return e instanceof Error ? e.message : "Something went wrong";
}
