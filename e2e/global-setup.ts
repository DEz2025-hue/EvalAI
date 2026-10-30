import fs from "node:fs";
import path from "node:path";

// The demo store persists to apps/web/.tmp-data between runs; start every run from an empty one.
export default async function globalSetup(): Promise<void> {
  fs.rmSync(path.join(__dirname, "..", "apps", "web", ".tmp-data"), { recursive: true, force: true });
}
