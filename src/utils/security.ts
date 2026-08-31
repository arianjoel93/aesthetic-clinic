export function isValidPin(pin: string) {
  return /^\d{4}$/.test(pin);
}

export async function sha256(value: string) {
  const encoder = new TextEncoder();
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
