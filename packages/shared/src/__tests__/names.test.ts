import { describe, it, expect } from "vitest";
import { displayName, firstName, initials, nameFromEmail } from "../names";

describe("nameFromEmail", () => {
  it("splits a run-together first and last name and drops digits", () => {
    expect(nameFromEmail("michaelcollins1406@gmail.com")).toBe("Michael Collins");
  });
  it("uses separators when present", () => {
    expect(nameFromEmail("jane.doe@example.com")).toBe("Jane Doe");
    expect(nameFromEmail("mary_ann-smith@example.com")).toBe("Mary Ann Smith");
  });
  it("prefers the longest known first name", () => {
    expect(nameFromEmail("christopherlee@x.com")).toBe("Christopher Lee");
  });
  it("ignores plus-addressing", () => {
    expect(nameFromEmail("sarahjones+work@x.com")).toBe("Sarah Jones");
  });
  it("keeps a lone first name whole", () => {
    expect(nameFromEmail("michael@x.com")).toBe("Michael");
  });
  it("does not invent a split for unknown words", () => {
    expect(nameFromEmail("jsmith@x.com")).toBe("Jsmith");
  });
  it("returns empty when nothing name-like is left", () => {
    expect(nameFromEmail("12345@x.com")).toBe("");
    expect(nameFromEmail(null)).toBe("");
  });
});

describe("displayName", () => {
  it("prefers the saved full name", () => {
    expect(displayName({ email: "michaelcollins1406@gmail.com", user_metadata: { full_name: "Mike C" } })).toBe("Mike C");
  });
  it("falls back to the email guess, then the email", () => {
    expect(displayName({ email: "michaelcollins1406@gmail.com" })).toBe("Michael Collins");
    expect(displayName({ email: "123@x.com" })).toBe("123@x.com");
    expect(displayName(null)).toBe("");
  });
});

describe("firstName / initials", () => {
  it("derives greeting name and avatar initials", () => {
    expect(firstName("Michael Collins")).toBe("Michael");
    expect(initials("Michael Collins")).toBe("MC");
    expect(initials("Michael")).toBe("M");
    expect(initials("")).toBe("?");
  });
});
