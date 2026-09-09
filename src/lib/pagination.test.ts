import { describe, expect, it } from "vitest";
import { paginate } from "./pagination";

describe("paginate", () => {
  it("clamps an out-of-range page and returns the corresponding items", () => {
    const result = paginate(["a", "b", "c", "d", "e", "f"], 9, 2);

    expect(result).toEqual({
      items: ["e", "f"],
      page: 3,
      pageCount: 3,
    });
  });

  it("keeps an empty feed on the first page", () => {
    expect(paginate([], 2, 5)).toEqual({ items: [], page: 1, pageCount: 1 });
  });
});
