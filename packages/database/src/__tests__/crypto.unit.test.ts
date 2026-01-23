import { describe, expect, it } from "vitest";

import { decrypt, encrypt } from "../crypto";

describe("Crypto Utilities", () => {
  const KEY =
    "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"; // 256-bit hex key

  it("should encrypt and decrypt correctly", () => {
    const originalText = "my-secret-token";
    const encrypted = encrypt(originalText, KEY);

    expect(encrypted).toBeDefined();
    expect(encrypted).not.toBe(originalText);

    const decrypted = decrypt(encrypted, KEY);
    expect(decrypted).toBe(originalText);
  });

  it("should throw error when decrypting with wrong key", () => {
    const originalText = "my-secret-token";
    const encrypted = encrypt(originalText, KEY);

    const wrongKey =
      "1111111111111111111111111111111111111111111111111111111111111111";

    expect(() => decrypt(encrypted, wrongKey)).toThrow();
  });
});
