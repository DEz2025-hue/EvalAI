import { describe, it, expect } from "vitest";
import { toMinor, fromMinor, lineTotalMinor, quotationTotalAmount, assertSingleCurrency, formatAmount, minorDigits } from "../money";

describe("minor-unit money", () => {
  it("converts using the currency's minor unit", () => {
    expect(minorDigits("USD")).toBe(2);
    expect(minorDigits("jpy")).toBe(0);
    expect(minorDigits("KWD")).toBe(3);
    expect(toMinor(12.34, "USD")).toBe(1234);
    expect(toMinor(1500, "JPY")).toBe(1500);
    expect(toMinor(1.234, "KWD")).toBe(1234);
  });

  it("rounds decimal ties up instead of trusting binary floats", () => {
    expect(toMinor(1.005, "USD")).toBe(101); // 1.005 * 100 = 100.49999999999999 in floats
    expect(toMinor(2.675, "USD")).toBe(268);
  });

  it("0.1 + 0.2 style sums are exact", () => {
    const total = quotationTotalAmount(
      [{ quantity: 1, unitPrice: 0.1 }, { quantity: 1, unitPrice: 0.2 }],
      "USD",
    );
    expect(total).toBe(0.3);
    expect(0.1 + 0.2).not.toBe(0.3); // the bug this prevents
  });

  it("line total = quantity x price + fees, in integers", () => {
    expect(lineTotalMinor({ quantity: 3, unitPrice: 19.99, taxesOrFees: 1.5 }, "USD")).toBe(3 * 1999 + 150);
    expect(lineTotalMinor({ quantity: 2.5, unitPrice: 10.1 }, "USD")).toBe(2525);
  });

  it("a large quotation total has no float drift", () => {
    const lines = Array.from({ length: 1000 }, () => ({ quantity: 1, unitPrice: 0.1 }));
    expect(quotationTotalAmount(lines, "USD")).toBe(100);
  });

  it("rejects invalid numbers", () => {
    expect(() => lineTotalMinor({ quantity: -1, unitPrice: 1 }, "USD")).toThrow(/quantity/);
    expect(() => lineTotalMinor({ quantity: 1, unitPrice: -1 }, "USD")).toThrow(/unit price/);
    expect(() => lineTotalMinor({ quantity: 1, unitPrice: 1, taxesOrFees: -5 }, "USD")).toThrow(/fees/);
    expect(() => toMinor(NaN, "USD")).toThrow();
  });

  it("refuses to sum mixed currencies", () => {
    expect(() => assertSingleCurrency([{ currency: "USD" }, { currency: "EUR" }], "USD")).toThrow(/All lines must use USD/);
    expect(() => quotationTotalAmount([{ quantity: 1, unitPrice: 1, currency: "EUR" }], "USD")).toThrow();
    expect(() => assertSingleCurrency([{ currency: "usd" }], "USD")).not.toThrow();
  });

  it("formats with the currency's decimals", () => {
    expect(formatAmount(1234.5, "USD")).toBe("1234.50");
    expect(formatAmount(1235, "JPY")).toBe("1235");
    expect(formatAmount(NaN, "USD")).toBe("—");
    expect(fromMinor(1234, "USD")).toBe(12.34);
  });
});
