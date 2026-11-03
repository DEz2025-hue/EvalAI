import { useState } from "react";
import { View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SCENARIOS, SCENARIO_LIST, scenarioFor, type PackId, type Scenario } from "@eval-ai/shared";
import { apiFetch } from "../../lib/api";
import { isSystem, SYSTEMS, systemOptions } from "../../lib/packs";
import { colors, space } from "../../lib/theme";
import { Banner, Button, Card, Field, OptionCard, Screen, Select, Text } from "../../components/ui";

type Mode = "assessment" | "inspection";

export default function CreateScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; pack?: string }>();
  const initialMode: Mode = params.mode === "inspection" ? "inspection" : "assessment";
  const initialPack: PackId = isSystem(params.pack) ? params.pack : SYSTEMS[0].id;
  const [mode, setMode] = useState<Mode>(initialMode);
  const [pack, setPack] = useState<PackId>(initialPack);
  const [siteName, setSiteName] = useState("");
  const [address, setAddress] = useState("");
  const [goal, setGoal] = useState("");
  const [existingEquipment, setExistingEquipment] = useState("");
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setNameError(null);
    setScenarioError(null);
    // An inspection is always an existing system; an assessment must say which.
    const situation = scenarioFor(mode, scenario);
    if (!situation) {
      setScenarioError("Choose whether this is a new installation or an existing system.");
      return;
    }
    if (siteName.trim().length < 2) {
      setNameError("Enter at least 2 characters.");
      return;
    }
    if (siteName.length > 100) {
      setNameError("Keep it under 100 characters.");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, pack, siteName: siteName.trim(), address: address.trim() || undefined, goal: goal.trim() || undefined, existingEquipment: existingEquipment.trim() || undefined, scenario: situation }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? "Could not create the job — please try again");
      // First stop: describe the site or take photos so the app can guide the checklist (skippable).
      router.replace(("/assessments/" + data.id + "/intake?first=1") as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Screen>
        <View style={{ gap: space.sm }}>
          <Text variant="label" color={colors.text}>Job type</Text>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <OptionCard icon="clipboard-outline" title="Assessment" subtitle="Evaluate the site and plan the work" selected={mode === "assessment"} onPress={() => setMode("assessment")} />
            <OptionCard icon="checkmark-done-outline" title="Inspection" subtitle="Check an install against its scope" selected={mode === "inspection"} onPress={() => setMode("inspection")} />
          </View>
        </View>

        <View style={{ gap: space.sm }}>
          <Text variant="label" color={colors.text}>Situation at the site</Text>
          {mode === "inspection" ? (
            <Banner tone="neutral" message="An inspection is always of a system that is already installed." />
          ) : (
            <>
              <View style={{ flexDirection: "row", gap: space.sm }}>
                {SCENARIO_LIST.map((s) => (
                  <OptionCard
                    key={s.id}
                    icon={s.id === "new_install" ? "construct-outline" : "build-outline"}
                    title={s.label}
                    subtitle={s.hint}
                    selected={scenario === s.id}
                    onPress={() => { setScenario(s.id); setScenarioError(null); }}
                  />
                ))}
              </View>
              {scenarioError ? <Text variant="caption" color={colors.danger}>{scenarioError}</Text> : null}
            </>
          )}
        </View>

        <Select label="System" value={pack} options={systemOptions()} onChange={(v) => { if (isSystem(v)) setPack(v); }} />

        <Card style={{ gap: space.lg }}>
          <Text variant="heading">Site details</Text>
          <Field label="Site name" required value={siteName} onChangeText={setSiteName} placeholder="e.g. 12 Acacia Rd — roof" error={nameError} />
          <Field label="Address" value={address} onChangeText={setAddress} placeholder="Optional" />
          <Field label="Goal or scope" value={goal} onChangeText={setGoal} multiline placeholder={SCENARIOS[scenarioFor(mode, scenario) ?? "existing"].goalPlaceholder} />
          <Field
            label={SCENARIOS[scenarioFor(mode, scenario) ?? "existing"].equipmentLabel}
            value={existingEquipment}
            onChangeText={setExistingEquipment}
            multiline
            placeholder={SCENARIOS[scenarioFor(mode, scenario) ?? "existing"].equipmentPlaceholder}
          />
        </Card>

        {error ? <Banner tone="danger" title="Couldn't create the job" message={error} /> : null}

        <Button title={saving ? "Creating…" : "Create job"} icon="arrow-forward" onPress={submit} loading={saving} variant="accent" size="lg" />
        <Text variant="caption" style={{ textAlign: "center" }}>It's saved as a draft — you can come back to it from Jobs.</Text>
      </Screen>
    </>
  );
}
