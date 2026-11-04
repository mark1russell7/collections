import { describe, expect, it } from "vitest";
import { Err, Ok, type Result } from "../index.js";

describe("the match method of a result", () => {
  const cases = { Ok: (value: number): string => `ok ${value}`, Err: (error: string): string => `err ${error}` };

  it("calls the case of an Ok", () => {
    expect(Ok(1).match(cases)).toBe("ok 1");
  });

  it("calls the case of an Err", () => {
    expect(Err("no").match(cases)).toBe("err no");
  });

  it("is in the type of the union", () => {
    const result: Result<number, string> = Ok(2);
    expect(result.match(cases)).toBe("ok 2");
  });
});
