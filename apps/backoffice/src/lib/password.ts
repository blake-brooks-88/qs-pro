const CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%";

export function generatePassword(): string {
  let result = "";
  const array = new Uint8Array(20);
  crypto.getRandomValues(array);
  for (const byte of array) {
    result += CHARSET[byte % CHARSET.length];
  }
  return result;
}
