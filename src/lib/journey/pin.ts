import {
  randomInt,
  randomBytes,
  scrypt,
  timingSafeEqual,
  createHmac,
} from "node:crypto";
import { promisify } from "node:util";
const derive = promisify(scrypt);
export const validPin = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}$/.test(v);
export const generatePin = () => String(randomInt(0, 10000)).padStart(4, "0");
function pepper(pin: string, secret: string) {
  return createHmac("sha256", secret)
    .update("friend-pin:" + pin)
    .digest("hex");
}
export async function hashPin(pin: string, secret: string) {
  if (!validPin(pin) || !secret) throw Error("Invalid PIN configuration");
  const salt = randomBytes(16).toString("hex");
  const hash = (await derive(pepper(pin, secret), salt, 64)) as Buffer;
  return salt + ":" + hash.toString("hex");
}
export async function checkPin(pin: string, stored: string, secret: string) {
  if (!validPin(pin) || !secret) return false;
  const [salt, hash] = stored.split(":");
  if (!/^[a-f0-9]{32}$/.test(salt || "") || !/^[a-f0-9]{128}$/.test(hash || ""))
    return false;
  const actual = (await derive(pepper(pin, secret), salt, 64)) as Buffer;
  return timingSafeEqual(actual, Buffer.from(hash, "hex"));
}
