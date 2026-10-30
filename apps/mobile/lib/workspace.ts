import { secureStorage } from "./secureStorage";

const KEY = "evalai.workspace";
let memory: string | null | undefined;

/** Active workspace id chosen by the person (sent as x-workspace-id; the server verifies membership). */
export async function getActiveWorkspace(): Promise<string | null> {
  if (memory !== undefined) return memory;
  memory = await secureStorage.getItem(KEY);
  return memory;
}

export async function setActiveWorkspace(id: string | null): Promise<void> {
  memory = id;
  if (id) await secureStorage.setItem(KEY, id);
  else await secureStorage.removeItem(KEY);
}
