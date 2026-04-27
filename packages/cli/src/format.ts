// packages/cli/src/format.ts
import kleur from "kleur";

export function ok(msg: string): void { console.log(kleur.green("✓ ") + msg); }
export function info(msg: string): void { console.log(kleur.cyan("• ") + msg); }
export function warn(msg: string): void { console.warn(kleur.yellow("! ") + msg); }
export function err(msg: string): void { console.error(kleur.red("✗ ") + msg); }
export function banner(msg: string): void { console.log(kleur.bgBlue().white().bold(` ${msg} `)); }
export function ethFromWei(weiString: string): string {
  const w = BigInt(weiString);
  const whole = w / 10n ** 18n;
  const frac = w % 10n ** 18n;
  if (frac === 0n) return `${whole} ETH`;
  const fStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole}.${fStr} ETH`;
}
