import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnvironmentFile } from "./launch-preflight.mjs";

export const EXPECTED_SCHEMA_CONTRACT = "insuccess-personal-ai-v1-20260906";
const PLACEHOLDER_PATTERN = /(^|[\s@./_-])(your|example|placeholder|replace-me|change-me)([\s@./_-]|$)/i;

class SchemaContractError extends Error {}

function configured(value) {
  return typeof value === "string" && value.trim().length > 0 && !PLACEHOLDER_PATTERN.test(value.trim());
}

function validatedConfiguration(environment) {
  const missing = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"].filter(
    (name) => !configured(environment[name]),
  );
  if (missing.length) {
    throw new SchemaContractError(`Schema preflight missing or placeholder environment names: ${missing.join(", ")}`);
  }

  let url;
  try {
    url = new URL(environment.NEXT_PUBLIC_SUPABASE_URL.trim());
  } catch {
    throw new SchemaContractError("Schema preflight received an invalid NEXT_PUBLIC_SUPABASE_URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new SchemaContractError("Schema preflight requires NEXT_PUBLIC_SUPABASE_URL to be an HTTPS origin.");
  }

  return { url: url.origin, secretKey: environment.SUPABASE_SECRET_KEY.trim() };
}

export async function verifySchemaContract(environment, options = {}) {
  const { url, secretKey } = validatedConfiguration(environment);
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5_000;
  let response;

  try {
    response = await fetchImplementation(new URL("/rest/v1/rpc/insuccess_schema_contract", url), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`,
      },
      body: "{}",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new SchemaContractError("Production Supabase schema contract could not be reached.");
  }

  const returnedContract = await response.json().catch(() => null);
  if (!response.ok) {
    throw new SchemaContractError("Production Supabase schema contract is unavailable or unauthorized.");
  }
  if (returnedContract !== EXPECTED_SCHEMA_CONTRACT) {
    throw new SchemaContractError("Production Supabase schema contract does not match this application release.");
  }

  return returnedContract;
}

function argumentValue(argumentsList, name) {
  const exactIndex = argumentsList.indexOf(name);
  if (exactIndex >= 0) return argumentsList[exactIndex + 1] ?? null;
  const prefix = `${name}=`;
  const inline = argumentsList.find((argument) => argument.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : null;
}

async function main() {
  const envFile = argumentValue(process.argv.slice(2), "--env-file");
  if (!envFile) throw new SchemaContractError("Schema preflight requires --env-file.");

  let fileEnvironment;
  try {
    fileEnvironment = parseEnvironmentFile(await readFile(resolve(envFile), "utf8"));
  } catch {
    throw new SchemaContractError("Schema preflight could not read the requested environment file.");
  }

  await verifySchemaContract({ ...fileEnvironment, ...process.env });
  console.log(`Production Supabase schema contract passed: ${EXPECTED_SCHEMA_CONTRACT}`);
}

const directInvocation = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (directInvocation) {
  main().catch((error) => {
    console.error(
      error instanceof SchemaContractError
        ? error.message
        : "Production Supabase schema contract check failed. No environment values were printed.",
    );
    process.exitCode = 1;
  });
}
