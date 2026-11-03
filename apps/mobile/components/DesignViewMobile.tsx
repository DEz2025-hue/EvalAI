import type { ReactNode } from "react";
import { View } from "react-native";
import { CAMERA_TYPE_LABEL, DECISION_BASIS_LABEL, DORI_LABEL, cameraFix, cctvSizing, designCounts, type DesignProposal } from "@eval-ai/shared";
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

/**
 * A design proposal (D-034) as it reads in the report: the camera totals (counted from the schedule), the decisions, each area's
 * cameras, the options and what is still open. Editing the design is done on the web report screen.
 */
export function DesignViewMobile({ design }: { design: DesignProposal }) {
  const counts = designCounts(design);
  // The system sizing (D-037), worked out by the app from the plan.
  const z = cctvSizing(design);
  return (
    <View style={{ gap: space.lg }}>
      <View style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: space.md, gap: 4 }}>
        <Text variant="title">{counts.total} cameras</Text>
        {counts.byType.map((t) => <Text key={t.type} variant="caption" color={colors.text}>{t.count} × {t.label}</Text>)}
        {counts.optionalExtra ? <Text variant="caption">{counts.optionalExtra} more in the optional additions</Text> : null}
      </View>

      <Block title="System design (worked out by the app)">
        <Line>Bandwidth {Math.round(z.bandwidthMbps * 10) / 10} Mbps · storage {Math.round(z.storageWithHeadroomTb * 10) / 10} TB for {z.system.retentionDays.value} days</Line>
        <Line>{z.drives} × {z.system.driveTb.value} TB drives · {z.recorderChannels}-channel recorder</Line>
        <Line>PoE {z.poeTotalW} W · UPS {z.upsVa} VA for {z.system.upsMinutes.value} min</Line>
        {z.failing.length ? z.failing.map((c) => <Line key={c.id}>⚠ {c.id}: {cameraFix(c)}</Line>) : <Line muted>Every camera gives the detail it needs at its distance.</Line>}
      </Block>

      {design.basis.length ? (
        <Block title="Design basis">
          {design.basis.map((b, i) => <Line key={i}>{b.item}: {b.decision} ({DECISION_BASIS_LABEL[b.basis]})</Line>)}
        </Block>
      ) : null}

      {design.areas.map((a) => (
        <Block key={a.name} title={`${a.name} · ${a.cameras.length}`}>
          {a.cameras.map((c) => {
            const k = z.cameras.find((x) => x.id === c.id);
            return <Line key={c.id}>{c.id} {c.location} — {CAMERA_TYPE_LABEL[c.type]}{c.purpose ? `, ${c.purpose}` : ""}{k ? ` · ${DORI_LABEL[k.detail]} at ${k.distanceM} m ${k.meets ? "✓" : "⚠"}` : ""}</Line>;
          })}
          {a.uncovered.length ? <Text variant="caption">No camera inside: {a.uncovered.join("; ")}</Text> : null}
          {a.notes.map((n, i) => <Line key={"n" + i} muted>{n}</Line>)}
        </Block>
      ))}

      {design.options.length ? (
        <Block title="Optional additions (not in the count)">
          {design.options.map((o, i) => <Line key={i}>{o.area ? `${o.area}: ` : ""}{o.gap}{o.option ? ` — ${o.option}` : ""}</Line>)}
        </Block>
      ) : null}

      {design.openItems.length ? (
        <Block title="Assumptions and open items">
          {design.openItems.map((o, i) => <Line key={i}>{o.item} — {o.status}</Line>)}
        </Block>
      ) : null}

      {design.nextSteps.length ? (
        <Block title="Next steps">
          {design.nextSteps.map((s, i) => <Line key={i}>{s}</Line>)}
        </Block>
      ) : null}
      <Text variant="caption">Edit the design on the web report screen.</Text>
    </View>
  );
}
