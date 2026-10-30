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

// ---- Recorded, unit-aware calculations -------------------------------------------------------
// Every saved measurement keeps its formula id, its inputs (with units) and the result, so a reader
// can see exactly how a number was produced. The result is always computed here, never by AI.

export type LengthUnit = "m" | "cm" | "mm" | "ft" | "in";
export const LENGTH_UNITS: LengthUnit[] = ["m", "cm", "mm", "ft", "in"];
const TO_METRES: Record<LengthUnit, number> = { m: 1, cm: 0.01, mm: 0.001, ft: 0.3048, in: 0.0254 };

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function toMetres(value: number, unit: LengthUnit): number {
  if (!Number.isFinite(value)) throw new Error("Invalid number");
  const k = TO_METRES[unit];
  if (k === undefined) throw new Error(`Unsupported unit: ${unit}`);
  return round6(value * k);
}

export type FormulaId = "area" | "volume" | "cable_with_sag";

export type MeasurementInput = { value: number; unit: LengthUnit | "ratio" };

export type FormulaDef = {
  id: FormulaId;
  label: string;
  /** Human-readable method, printed with the measurement in reports. */
  method: string;
  resultUnit: string;
  inputs: Array<{ key: string; label: string; kind: "length" | "ratio"; defaultUnit: LengthUnit | "ratio"; defaultValue?: number }>;
};

export const FORMULAS: Record<FormulaId, FormulaDef> = {
  area: {
    id: "area",
    label: "Area (length × width)",
    method: "area = length × width, inputs converted to metres",
    resultUnit: "m²",
    inputs: [
      { key: "length", label: "Length", kind: "length", defaultUnit: "m" },
      { key: "width", label: "Width", kind: "length", defaultUnit: "m" },
    ],
  },
  volume: {
    id: "volume",
    label: "Volume (length × width × height)",
    method: "volume = length × width × height, inputs converted to metres",
    resultUnit: "m³",
    inputs: [
      { key: "length", label: "Length", kind: "length", defaultUnit: "m" },
      { key: "width", label: "Width", kind: "length", defaultUnit: "m" },
      { key: "height", label: "Height", kind: "length", defaultUnit: "m" },
    ],
  },
  cable_with_sag: {
    id: "cable_with_sag",
    label: "Cable length with slack/sag allowance",
    method: "cable length = straight run × slack factor (1.00–2.00), run converted to metres",
    resultUnit: "m",
    inputs: [
      { key: "straight", label: "Straight run", kind: "length", defaultUnit: "m" },
      { key: "factor", label: "Slack factor", kind: "ratio", defaultUnit: "ratio", defaultValue: 1.05 },
    ],
  },
};

export type CalculatedMeasurement = {
  formula: FormulaId;
  method: string;
  value: number;
  unit: string;
  /** The inputs as entered (value + unit) so the calculation can be audited. */
  inputs: Record<string, MeasurementInput>;
};

/** Compute a recorded measurement. Throws a clear error for missing, non-finite, zero or negative inputs. */
export function calculateMeasurement(formula: FormulaId, inputs: Record<string, MeasurementInput>): CalculatedMeasurement {
  const def = FORMULAS[formula];
  if (!def) throw new Error(`Unknown formula: ${formula}`);
  const metres: Record<string, number> = {};
  for (const spec of def.inputs) {
    const given = inputs[spec.key];
    if (!given) throw new Error(`${spec.label} is required`);
    if (!Number.isFinite(given.value)) throw new Error(`${spec.label} must be a number`);
    if (spec.kind === "ratio") {
      if (given.value < 1 || given.value > 2) throw new Error(`${spec.label} must be between 1.00 and 2.00`);
      metres[spec.key] = given.value;
    } else {
      if (given.value <= 0) throw new Error(`${spec.label} must be greater than zero`);
      if (given.unit === "ratio") throw new Error(`${spec.label} needs a length unit`);
      metres[spec.key] = toMetres(given.value, given.unit);
    }
  }
  let value: number;
  if (formula === "area") value = areaM2(metres.length, metres.width);
  else if (formula === "volume") value = volumeM3(metres.length, metres.width, metres.height);
  else value = cableLengthWithSag(metres.straight, metres.factor);
  return { formula, method: def.method, value: round6(value), unit: def.resultUnit, inputs };
}
