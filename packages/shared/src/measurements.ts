// Deterministic calculations — never use AI output as source of truth
export function areaM2(lengthM: number, widthM: number): number {
  if (!Number.isFinite(lengthM) || !Number.isFinite(widthM)) throw new Error("Invalid dimensions");
  return lengthM * widthM;
}
export function volumeM3(l: number, w: number, h: number): number {
  if (![l, w, h].every(Number.isFinite)) throw new Error("Invalid dimensions");
  return l * w * h;
}
export function cableLengthWithSag(straightM: number, sagFactor = 1.05): number {
  return straightM * sagFactor;
}
