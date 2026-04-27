// packages/cli/src/passphrase.ts
import prompts from "prompts";

export async function readPassphrase(envName: string, promptText: string): Promise<string> {
  const fromEnv = process.env[envName];
  if (fromEnv) return fromEnv;
  const { value } = await prompts({
    type: "password",
    name: "value",
    message: promptText,
  });
  if (!value) throw new Error("passphrase required");
  return value;
}
