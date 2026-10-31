import { useEffect, useState } from "react";
import { View, Alert } from "react-native";
import { formatAmount, quotationTotalAmount } from "@eval-ai/shared";
import { apiFetch, apiBase } from "../lib/api";
import { colors, radius, space } from "../lib/theme";
import { Badge, Button, Card, EmptyState, Field, SectionHeader, Text } from "./ui";

type QItem = { description: string; quantity: number; unit: string; unitPrice: number; currency: string; taxesOrFees?: number };
type Quote = { id: string; supplier: string; date: string; currency: string; items: QItem[]; stale?: boolean; total?: number };

const quoteTotal = (q: Quote): number => q.total ?? quotationTotalAmount(q.items, q.currency);

export function QuotationReviewMobile({ assessmentId, materialsVersion = 1 }: { assessmentId: string; materialsVersion?: number }) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [supplier, setSupplier] = useState("");
  const [currency, setCurrency] = useState("AUD");
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");

  async function loadPersisted() {
    try {
      apiBase();
    } catch {
      return;
    }
    try {
      const res = await apiFetch(`/api/quotations?assessmentId=${assessmentId}`);
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      const d = data as { items?: Quote[] };
      if (d.items?.length) setQuotes(d.items as Quote[]);
    } catch {}
  }

  useEffect(() => {
    loadPersisted();
  }, []);

  async function addQuotation() {
    if (!supplier.trim()) {
      Alert.alert("Supplier required", "Enter the supplier's name as it appears on the quote.");
      return;
    }
    if (!desc.trim()) {
      Alert.alert("Line item required", "Enter at least one line item from the quote.");
      return;
    }
    const quantity = Number(qty);
    const unitPrice = Number(price);
    if (!(quantity > 0) || unitPrice < 0 || price.trim() === "") {
      Alert.alert("Check the numbers", "Quantity must be more than 0 and the price can't be negative.");
      return;
    }
    try {
      apiBase();
    } catch {
      Alert.alert("Not saved", "You're offline from the server — this stays on this screen until you reconnect.");
      return;
    }
    const q: Quote = { id: `q-${Date.now()}`, supplier: supplier.trim(), date: new Date().toISOString().slice(0, 10), currency, items: [{ description: desc.trim(), quantity, unit: "pc", unitPrice, currency }], stale: false };
    try {
      const res = await apiFetch("/api/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId, materialsVersion, supplier: q.supplier, currency, items: q.items, date: q.date, reference: "Quote via mobile" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Save failed");
      q.id = (data as { id?: string }).id ?? q.id;
      q.total = (data as { total?: number }).total;
      setQuotes((prev) => [...prev, q]);
      setSupplier("");
      setDesc("");
      setQty("1");
      setPrice("");
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : String(e));
    }
  }

  const current = quotes.filter((q) => !q.stale);
  const best = current.length > 0 ? Math.min(...current.map(quoteTotal)) : null;

  return (
    <Card>
      <SectionHeader title="Supplier quotes" subtitle="Enter prices exactly as they appear on the supplier's quote." />

      {current.length >= 2 ? (
        <View style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: space.md, gap: 6 }}>
          <Text variant="overline">Compare current quotes</Text>
          {current.map((q) => {
            const t = quoteTotal(q);
            const isBest = best !== null && t === best;
            return (
              <View key={q.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm }}>
                <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>{q.supplier}</Text>
                {isBest ? <Badge label="Lowest" tone="success" /> : null}
                <Text variant="bodyStrong" color={isBest ? colors.success : colors.text}>{formatAmount(t, q.currency)} {q.currency}</Text>
              </View>
            );
          })}
          <Text variant="caption">Lowest isn't always best — check scope and warranty.</Text>
        </View>
      ) : null}

      <View style={{ gap: space.md }}>
        <Field label="Supplier" value={supplier} onChangeText={setSupplier} placeholder="As shown on the quote" />
        <Field label="First line item" value={desc} onChangeText={setDesc} placeholder="Description from the quote" />
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 1 }}><Field label="Qty" value={qty} onChangeText={setQty} keyboardType="numeric" /></View>
          <View style={{ flex: 1.4 }}><Field label="Unit price" value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="0.00" /></View>
          <View style={{ width: 76 }}><Field label="Currency" value={currency} onChangeText={setCurrency} autoCapitalize="characters" maxLength={3} /></View>
        </View>
        <Button title="Add quote" icon="add" onPress={addQuotation} />
      </View>

      {quotes.length === 0 ? (
        <EmptyState icon="receipt-outline" title="No quotes yet" message="Add one from a supplier's document." />
      ) : (
        quotes.map((q) => (
          <View key={q.id} style={{ borderWidth: 1, borderColor: q.stale ? colors.warningBorder : colors.border, backgroundColor: q.stale ? colors.warningSoft : colors.surface, borderRadius: radius.sm, padding: space.md, gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{q.supplier}</Text>
                <Text variant="caption">{q.date}</Text>
              </View>
              <Badge label={q.stale ? "Out of date" : "Current"} tone={q.stale ? "warning" : "success"} />
            </View>
            {q.items.map((it, i) => (
              <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
                <Text variant="caption" color={colors.text} style={{ flex: 1 }}>{it.description}</Text>
                <Text variant="caption">{it.quantity} {it.unit} × {it.unitPrice} {it.currency}</Text>
              </View>
            ))}
            <Text variant="bodyStrong" style={{ textAlign: "right" }}>Total {formatAmount(quoteTotal(q), q.currency)} {q.currency}</Text>
          </View>
        ))
      )}
    </Card>
  );
}
