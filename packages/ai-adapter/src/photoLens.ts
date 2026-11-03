// What to look for in a site photo, by topic (D-035). A photo of a roof for a solar job needs a different eye from a photo of an air
// conditioner for the load list or a gate for a CCTV design. The lens is picked from the job's pack and the checklist item the photo is
// linked to (its title, group and "look for" text), so the model studies the photo for the job instead of describing the scene.

export type LensTopic = "solarRoof" | "loads" | "electrical" | "powerEquipment" | "cctvSite" | "cctvEquipment" | "solarGeneral" | "cctvGeneral";

export const LENSES: Record<LensTopic, string> = {
  solarRoof:
    "SOLAR ROOF OR MOUNTING AREA: the roof or ground area as a place for panels. Say the roof form (pitched, flat, hipped, lean-to) and covering (corrugated or IT sheet, tile, concrete, membrane), and its apparent condition (rust, sagging, broken or missing sheets, patches, moss). " +
    "Point out obstructions on it (vents, chimneys, water tanks, satellite dishes, antennas, skylights, roof lights, cables) and shade sources around it (trees, taller buildings, walls, parapets, masts) and on which side of the roof they are. " +
    "Say which part of the roof looks most suitable for panels and why (the largest clear, unshaded, even section), describing it by its place in the photo ('the larger right-hand slope', 'the flat section behind the tank'). " +
    "Say which way a slope faces only if the photo gives a real cue (a compass, a shadow with a known time, a note); otherwise say the orientation cannot be told from the photo. Note access (ladder points, parapets, edges) and safety. Never give an area, pitch angle or dimension as a fact.",
  loads:
    "LOADS AND APPLIANCES for the energy audit: identify each appliance (split or window air conditioner indoor or outdoor unit, refrigerator, freezer, water pump, water heater, motor, lights, computer, and so on) and how many of it are visible. " +
    "Read every nameplate, rating label or energy label you can: quote exactly the model, voltage (V), current (A), power (W or kW), cooling capacity (BTU/h or kW), phase, frequency and any 'inverter' marking. A label you cannot read fully: say which parts are unreadable and ask for a closer photo. " +
    "These label values are READINGS of printed text, not verified measurements: report them as 'the label reads …'. Do not estimate a rating that is not printed.",
  electrical:
    "ELECTRICAL SUPPLY, BOARD OR WIRING: identify the board, meter, isolator or cabling. Read breaker and meter labels and any display (ratings printed on breakers, meter type and number, readings shown) exactly. " +
    "Say how it is mounted and its apparent condition (open covers, scorch marks, loose or untidy cables, missing blanks, signs of water). Note whether an earth conductor or bar is visible, without concluding that earthing is adequate.",
  powerEquipment:
    "EXISTING POWER EQUIPMENT (inverter, batteries, charge controller, generator, existing panels): identify each item and read its nameplate or display exactly (make, model, rated power, battery voltage and capacity, display values). " +
    "Say how it is installed (wall, floor, rack, ventilation space, cable entry), its apparent condition (corrosion, swelling, dust, heat marks, loose cables) and its surroundings (room, ventilation, water, access).",
  cctvSite:
    "CCTV COVERAGE OF A PLACE (entrance, gate, perimeter, yard, corridor, room): describe the space a camera would need to see, the entry and exit points, the routes people and vehicles take, " +
    "good mounting points (walls, poles, eaves, corners) and their apparent height, lighting at the spot and likely glare or backlight (a bright doorway, the sun, headlights), obstructions to a view (trees, pillars, signs, parked cars) and where cable could run. " +
    "Say which mounting point looks best and which way the camera should look, by place in the photo.",
  cctvEquipment:
    "CCTV EQUIPMENT (camera, recorder, switch, cabinet, cabling): identify each item and read its label or display exactly (make, model, channels, ports, storage). Say how it is mounted, its apparent condition, the view a camera seems to have, and the state of cabling and cabinets.",
  solarGeneral:
    "SOLAR JOB: look for what matters to a solar installation: the roof or mounting area and its shade, the existing supply and board, the loads, existing power equipment, where an inverter and batteries could go (a dry, ventilated, reachable wall) and cable routes between them.",
  cctvGeneral:
    "CCTV JOB: look for what matters to a camera system: entrances, gates, perimeter and routes, mounting points, lighting, obstructions, where a recorder and network cabinet could go, and cable routes.",
};

/** Words that point an item (title, group or "look for" text) at a topic. */
const MATCHERS: Array<[LensTopic, RegExp]> = [
  ["loads", /\b(load|loads|appliance|appliances|consumption|energy (?:use|audit)|demand|air ?con|a\.?c\.?\b|aircon|fridge|refrigerator|freezer|pump|heater|motor)/i],
  ["solarRoof", /\b(roof|rooftop|structure|structural|array|mounting|racking|tilt|orientation|azimuth|shad(?:e|ing)|pitch|ground mount)/i],
  ["powerEquipment", /\b(inverter|batter(?:y|ies)|charge controller|generator|genset|existing (?:panel|pv|system))/i],
  ["electrical", /\b(board|breaker|meter|distribution|db\b|earth|earthing|wiring|cable|cabling|isolator|supply|grid|electrical)/i],
  ["cctvEquipment", /\b(camera|cameras|nvr|dvr|recorder|switch|poe|cabinet|rack|monitor)/i],
  ["cctvSite", /\b(gate|gates|perimeter|fence|entrance|entry|exit|door|yard|compound|parking|corridor|coverage|blind spot|lighting)/i],
];

/** The lenses for one photo: up to two specific ones that match its item, then the job's general lens. */
export function lensesFor(pack: "solar" | "cctv", item?: { title?: string; category?: string; lookFor?: string } | null): LensTopic[] {
  const text = [item?.title, item?.category, item?.lookFor].filter(Boolean).join(" ");
  const allowed: LensTopic[] = pack === "solar" ? ["loads", "solarRoof", "powerEquipment", "electrical"] : ["cctvEquipment", "cctvSite", "electrical"];
  const found = text ? MATCHERS.filter(([topic, re]) => allowed.includes(topic) && re.test(text)).map(([topic]) => topic).slice(0, 2) : [];
  return [...found, pack === "solar" ? "solarGeneral" : "cctvGeneral"];
}

/** The lens text for the prompt. */
export function lensText(topics: LensTopic[]): string {
  return topics.map((t) => LENSES[t]).join(" ");
}
