import { describe, expect, it } from "vitest";
import {
  createHistory,
  recordHistory,
  redoHistory,
  undoHistory,
} from "./history";

describe("history", () => {
  it("records past states and undoes to the previous present", () => {
    const history = recordHistory(createHistory("first"), "second");

    expect(history).toEqual({
      past: ["first"],
      present: "second",
      future: [],
    });
    expect(undoHistory(history)).toEqual({
      past: [],
      present: "first",
      future: ["second"],
    });
  });

  it("redoes the next future state", () => {
    const history = undoHistory(recordHistory(createHistory("first"), "second"));

    expect(redoHistory(history)).toEqual({
      past: ["first"],
      present: "second",
      future: [],
    });
  });

  it("clears redo history after recording a new state", () => {
    const history = recordHistory(
      undoHistory(recordHistory(createHistory("first"), "second")),
      "third",
    );

    expect(history).toEqual({
      past: ["first"],
      present: "third",
      future: [],
    });
  });

  it("keeps history within the configured limit", () => {
    const history = ["second", "third", "fourth"].reduce(
      (current, present) => recordHistory(current, present, { limit: 2 }),
      createHistory("first"),
    );

    expect(history.past).toEqual(["second", "third"]);
    expect(history.present).toBe("fourth");
  });

  it("can record from an explicit previous state", () => {
    const history = recordHistory(
      createHistory("first"),
      "third",
      { previous: "second" },
    );

    expect(history.past).toEqual(["second"]);
    expect(history.present).toBe("third");
  });
});
