import { describe, expect, it, vi } from "vitest";

import { generatePassword } from "./password";

describe("generatePassword", () => {
  it("generates a 20 character password", () => {
    const getRandomValues = vi
      .spyOn(crypto, "getRandomValues")
      .mockImplementation((arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = i;
        }
        return arr;
      });

    const password = generatePassword();
    expect(password).toHaveLength(20);

    getRandomValues.mockRestore();
  });
});

