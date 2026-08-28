import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

export const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}