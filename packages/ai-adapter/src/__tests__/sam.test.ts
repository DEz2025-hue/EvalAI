import { describe, it, expect } from "vitest";
import { extractSamText, parseSamBoxes } from "../sam";

// Records copied from Meta's SAM documentation (mask payloads shortened).
const NO_CONF = "<0f>0<|box;x1=181;y1=365;x2=556;y2=486;w=1516;h=1600|><|mask;x=0;y=0;data=122,376,~abc|>";
const WITH_CONF = "<0f>1<|box;x1=444;y1=625;x2=679;y2=850;w=1800;h=1200;c=0.9609375|><|mask;x=0;y=0;c=0.9609375;data=226,236,!xyz|>";

describe("parseSamBoxes", () => {
  it("reads a record without confidence", () => {
    expect(parseSamBoxes(NO_CONF)).toEqual([{ ordinal: 0, x1: 181, y1: 365, x2: 556, y2: 486, w: 1516, h: 1600 }]);
  });
  it("reads confidence and several comma-separated records, ignoring masks", () => {
    const boxes = parseSamBoxes(NO_CONF + "," + WITH_CONF.replace("w=1800;h=1200", "w=1516;h=1600"));
    expect(boxes).toHaveLength(2);
    expect(boxes[1]).toMatchObject({ ordinal: 1, x1: 444, y2: 850, c: 0.9609375 });
  });
  it("returns nothing for zero matches or unexpected text", () => {
    expect(parseSamBoxes("")).toEqual([]);
    expect(parseSamBoxes("I cannot find that")).toEqual([]);
  });
  it("skips malformed or impossible boxes instead of guessing", () => {
    expect(parseSamBoxes("<0f>0<|box;x1=10;y1=10;x2=5;y2=20;w=100;h=100|>")).toEqual([]); // x2 < x1
    expect(parseSamBoxes("<0f>0<|box;x1=10;y1=10;x2=500;y2=20;w=100;h=100|>")).toEqual([]); // outside the image
    expect(parseSamBoxes("<0f>0<|box;x1=a;y1=10;x2=50;y2=20;w=100;h=100|>")).toEqual([]);
    expect(parseSamBoxes("<0f>0<|box;x1=1;y1=1;x2=5;y2=5;w=100;h=100;c=7|>")[0].c).toBeUndefined(); // confidence out of range
  });
  it("ignores video frames other than frame 0", () => {
    expect(parseSamBoxes("<3f>0<|box;x1=1;y1=1;x2=5;y2=5;w=100;h=100|>")).toEqual([]);
  });
});

describe("extractSamText", () => {
  it("joins streamed delta events", () => {
    const half = Math.floor(NO_CONF.length / 2);
    const sse = [
      "event: response.output_text.delta",
      "data: " + JSON.stringify({ type: "response.output_text.delta", delta: NO_CONF.slice(0, half) }),
      "",
      "event: response.output_text.delta",
      "data: " + JSON.stringify({ type: "response.output_text.delta", delta: NO_CONF.slice(half) }),
      "",
      "data: " + JSON.stringify({ type: "response.completed", response: { output_text: NO_CONF } }),
      "data: [DONE]",
    ].join("\n");
    expect(extractSamText(sse)).toBe(NO_CONF);
    expect(parseSamBoxes(extractSamText(sse))).toHaveLength(1);
  });
  it("falls back to the completed event and to plain JSON bodies", () => {
    const sse = "data: " + JSON.stringify({ type: "response.completed", response: { output_text: NO_CONF } });
    expect(extractSamText(sse)).toBe(NO_CONF);
    expect(extractSamText({ output_text: NO_CONF })).toBe(NO_CONF);
    expect(extractSamText({ output: [{ content: [{ text: NO_CONF }] }] })).toBe(NO_CONF);
    expect(extractSamText(NO_CONF)).toBe(NO_CONF);
    expect(extractSamText(null)).toBe("");
  });
  it("yields nothing for a completed stream with no matches", () => {
    expect(extractSamText("data: " + JSON.stringify({ type: "response.completed", response: { output_text: "" } }))).toBe("");
  });
});
