import type { ReactNode } from "react";
import { View } from "react-native";
import { DECISION_BASIS_LABEL, LOAD_SOURCE_LABEL, SYSTEM_TYPE_LABEL, kilo, sizedEquipment, solarSizing, type SolarDesign } from "@eval-ai/shared";
import { colors, radius, space } from "../lib/theme";
import { Text } from "./ui";

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="heading">{title}</Text>
      {children}
    </View>
  );
}

const Line = ({ children, muted }: { children: ReactNode; muted?: boolean }) => (
  <Text variant="caption" color={muted ? colors.textMuted : colors.text}>• {children}</Text>
);

/** One figure in the headline tiles. */
function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: "45%", backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: space.md, gap: 2 }}>
      <Text variant="caption">{label}</Text>
      <Text variant="title">{value}</Text>
    </View>
  );
}

/**
 * A solar design proposal (D-036) as it reads in the report: the system worked out by the app, the load schedule, the sizing steps and what
 * is still open. Editing the loads and inputs is done on the web report screen.
 */
export function SolarViewMobile({ design }: { design: SolarDesign }) {
  const s = solarSizing(design);
  const max = Math.max(s.dailyWh, s.dailyProductionWh, 1);
  const barRow = (label: string, wh: number, tone: string) => (
    <View key={label} style={{ gap: 2 }}>
      <Text variant="caption">{label}: {kilo(wh, "Wh")}</Text>
      <View style={{ height: 10, backgroundColor: colors.surfaceMuted, borderRadius: radius.pill }}>
        <View style={{ width: `${Math.max(2, Math.round((wh / max) * 100))}%`, height: 10, backgroundColor: tone, borderRadius: radius.pill }} />
      </View>
    </View>
  );
  return (
    <View style={{ gap: space.lg }}>
      <Text variant="bodyStrong">{SYSTEM_TYPE_LABEL[design.inputs.systemType]}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <Tile label="Solar array" value={kilo(s.arrayWp, "Wp")} />
        <Tile label="Panels" value={`${s.panelCount} × ${design.inputs.panelWatts.value} W`} />
        <Tile label="Inverter" value={kilo(s.inverterW, "W")} />
        <Tile label="Battery" value={s.batteryNominalWh > 0 ? kilo(s.batteryNominalWh, "Wh") : "None"} />
      </View>
      <View style={{ gap: space.xs }}>
        {barRow("Daily energy need", s.dailyWh, colors.textMuted)}
        {barRow("Expected daily production", s.dailyProductionWh, colors.success)}
      </View>

      <Block title={`Load schedule · ${kilo(s.dailyWh, "Wh")} per day`}>
        {design.loads.map((l, i) => (
          <Line key={i}>
            {l.quantity > 1 ? `${l.quantity} × ` : ""}{l.name}: {l.watts} W, {l.hoursPerDay} h/day ({LOAD_SOURCE_LABEL[l.source]})
          </Line>
        ))}
      </Block>

      <Block title="Sizing (worked out by the app)">
        {s.steps.map((st) => <Line key={st.label}>{st.label}: {st.value.toLocaleString("en-US")} {st.unit}</Line>)}
      </Block>

      {design.basis.length ? (
        <Block title="Design basis">
          {design.basis.map((b, i) => <Line key={i}>{b.item}: {b.decision} ({DECISION_BASIS_LABEL[b.basis]})</Line>)}
        </Block>
      ) : null}

      {design.placement.length ? (
        <Block title="Panel placement">
          {design.placement.map((p, i) => <Line key={i}>{p}</Line>)}
        </Block>
      ) : null}

      <Block title="Main equipment">
        {sizedEquipment(design, s).map((e) => <Line key={e.item}>{e.item}: {e.specification}</Line>)}
      </Block>

      {design.openItems.length ? (
        <Block title="Assumptions and open items">
          {design.openItems.map((o, i) => <Line key={i}>{o.item} — {o.status}</Line>)}
        </Block>
      ) : null}
      <Text variant="caption">Edit the loads and sizing inputs on the web report screen.</Text>
    </View>
  );
}
