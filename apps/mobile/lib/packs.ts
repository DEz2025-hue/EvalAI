import { PACK_TEMPLATES, type PackId, type PackTemplate } from "@eval-ai/shared";
import type { IconName } from "../components/ui";

/** Every system (Solar, CCTV, …) in template order. New systems added to the shared templates appear here automatically. */
export const SYSTEMS: PackTemplate[] = Object.values(PACK_TEMPLATES);

export function isSystem(id: unknown): id is PackId {
  return typeof id === "string" && id in PACK_TEMPLATES;
}

export function systemLabel(id: string): string {
  return isSystem(id) ? PACK_TEMPLATES[id].label : id ? id[0].toUpperCase() + id.slice(1) : "Unknown";
}

const ICONS: Partial<Record<string, IconName>> = {
  solar: "sunny-outline",
  cctv: "videocam-outline",
};

/** Icon for a system; systems without one get a generic icon. */
export function systemIcon(id: string): IconName {
  return ICONS[id] ?? "construct-outline";
}

export function systemOptions() {
  return SYSTEMS.map((s) => ({ value: s.id as string, label: s.label, description: s.description, icon: systemIcon(s.id) }));
}
