import { describe, expect, it, vi } from "vitest";

import { generatePassword } from "./password";

describe("generatePassword", () => {
  it("generates a 20 character password", () => {
    const getRandomValues = vi
      .spyOn(crypto, "getRandomValues")
      .mockImplementation(<T extends ArrayBufferView>(arr: T): T => {
        const view = new Uint8Array((arr as unknown as Uint8Array).buffer);
        for (let i = 0; i < view.length; i++) {
          view[i] = i;
        }
        return arr;
      });

    const password = generatePassword();
    expect(password).toHaveLength(20);

    getRandomValues.mockRestore();
  });
});
