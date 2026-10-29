import { useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, Alert } from "react-native";
import { apiFetch, apiBase } from "../lib/api";

type QItem = { description: string; quantity: number; unit: string; unitPrice: number; currency: string; taxesOrFees?: number };
type Quote = { id: string; supplier: string; date: string; currency: string; items: QItem[]; stale?: boolean; total?: number };

const quoteTotal = (q: Quote): number => q.total ?? q.items.reduce((s, it) => s + it.quantity * it.unitPrice + (it.taxesOrFees ?? 0), 0);

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
      Alert.alert("Supplier required", "Enter the supplier name from the quotation document — no placeholder suppliers.");
      return;
    }
    if (!desc.trim()) {
      Alert.alert("Line item required", "Enter the first line description from the supplier document.");
      return;
    }
    const quantity = Number(qty);
    const unitPrice = Number(price);
    if (!(quantity > 0) || unitPrice < 0 || price.trim() === "") {
      Alert.alert("Invalid line", "Quantity must be positive and price non-negative.");
      return;
    }
    try {
      apiBase();
    } catch {
      Alert.alert("Kept on this screen only", "Set EXPO_PUBLIC_APP_URL to persist quotations server-side.");
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
    <View style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, backgroundColor: "#fff", padding: 12, gap: 10 }}>
      <Text style={{ fontWeight: "700", fontSize: 13, color: "#0f172a" }}>Supplier quotations — provenance & stale handling</Text>
      <Text style={{ fontSize: 11, color: "#64748b" }}>Quotes tie to <Text style={{ fontWeight: "600" }}>materialsVersion={materialsVersion}</Text>. If materials change, prior quotes show stale — needs review.</Text>

      {current.length >= 2 ? (
        <View style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 10, gap: 4, backgroundColor: "#f8fafc" }}>
          <Text style={{ fontWeight: "700", fontSize: 12, color: "#0f172a" }}>Comparison · current quotes</Text>
          {current.map((q) => {
            const t = quoteTotal(q);
            const isBest = best !== null && t === best;
            return (
              <View key={q.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 12, color: "#0f172a" }}>{q.supplier} · {q.items.length} lines</Text>
                <Text style={{ fontSize: 12, fontWeight: "700", color: isBest ? "#15803d" : "#0f172a" }}>{t.toFixed(2)} {q.currency}{isBest ? " · lowest" : ""}</Text>
              </View>
            );
          })}
          <Text style={{ fontSize: 10, color: "#64748b" }}>Lowest is informational — verify scope and warranty first.</Text>
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <TextInput value={supplier} onChangeText={setSupplier} placeholder="Supplier (from document)" style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 8, fontSize: 13, color: "#0f172a", backgroundColor: "#fff" }} />
        <TextInput value={desc} onChangeText={setDesc} placeholder="First line description (from document)" style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 8, fontSize: 13, color: "#0f172a", backgroundColor: "#fff" }} />
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <TextInput value={qty} onChangeText={setQty} keyboardType="numeric" placeholder="Qty" style={{ flex: 1, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 8, fontSize: 13, color: "#0f172a", backgroundColor: "#fff" }} />
          <TextInput value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="Unit price" style={{ flex: 1, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 8, fontSize: 13, color: "#0f172a", backgroundColor: "#fff" }} />
          <TextInput value={currency} onChangeText={setCurrency} placeholder="AUD" style={{ width: 64, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 8, fontSize: 13, color: "#0f172a", backgroundColor: "#fff" }} />
        </View>
        <Pressable onPress={addQuotation} style={{ backgroundColor: "#0f172a", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Add quotation</Text>
        </Pressable>
      </View>

      <Text style={{ fontSize: 11, color: "#64748b" }}>No fabricated prices — totals from supplied line items. Changing materials marks prior quotes stale.</Text>

      {quotes.length === 0 ? (
        <View style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 16, alignItems: "center", backgroundColor: "#f8fafc" }}>
          <Text style={{ fontSize: 12, color: "#64748b" }}>No quotations — add from supplier document.</Text>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {quotes.map((q) => (
            <View key={q.id} style={{ borderWidth: 1, borderColor: q.stale ? "#fde68a" : "#e2e8f0", borderRadius: 10, padding: 10, backgroundColor: q.stale ? "#fefce8" : "#fff", gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontWeight: "600", fontSize: 12, color: "#0f172a" }}>{q.supplier} — {q.date} — total {quoteTotal(q).toFixed(2)} {q.currency}</Text>
                <Text style={{ fontSize: 10, fontWeight: "700", color: q.stale ? "#92400e" : "#15803d", backgroundColor: q.stale ? "#fef3c7" : "#dcfce7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 }}>{q.stale ? "stale" : "current"}</Text>
              </View>
              {q.items.map((it, i) => (
                <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#f1f5f9", paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, color: "#0f172a", flex: 1 }}>{it.description}</Text>
                  <Text style={{ fontSize: 11, color: "#475569" }}>{it.quantity} {it.unit} — {it.unitPrice} {it.currency}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
