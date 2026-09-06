import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const APP_REQUIRED_ENV_NAMES = Object.freeze([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPPORT_EMAIL",
  "NEXT_PUBLIC_LEGAL_ENTITY_NAME",
  "SUPABASE_SECRET_KEY",
  "PASSWORD_RESET_ORIGIN",
]);

export const DEPLOY_REQUIRED_ENV_NAMES = Object.freeze([
  "VERCEL_TOKEN",
  "VERCEL_ORG_ID",
  "VERCEL_PROJECT_ID",
]);

const AI_CREDENTIAL_NAMES = Object.freeze(["AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN"]);
const VIDEO_SIGNING_ENV_NAMES = Object.freeze(["MUX_SIGNING_KEY_ID", "MUX_SIGNING_PRIVATE_KEY"]);
const PLACEHOLDER_PATTERN = /(^|[\s@./_-])(your|example|placeholder|replace-me|change-me)([\s@./_-]|$)/i;

function cleanValue(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseEnvironmentFile(contents) {
  const parsed = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const candidate = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separator = candidate.indexOf("=");
    if (separator < 1) continue;

    const name = candidate.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    parsed[name] = cleanValue(candidate.slice(separator + 1));
  }

  return parsed;
}

function configured(value) {
  return typeof value === "string" && value.trim().length > 0 && !PLACEHOLDER_PATTERN.test(value.trim());
}

function validHttpsOrigin(value) {
  if (!configured(value)) return false;

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.pathname === "/" || url.pathname === "")
    );
  } catch {
    return false;
  }
}

function validEmailAddress(value) {
  return configured(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function evaluateLaunchEnvironment(environment, options = {}) {
  const missing = APP_REQUIRED_ENV_NAMES.filter((name) => !environment[name]?.trim());
  const invalid = APP_REQUIRED_ENV_NAMES.filter(
    (name) => !missing.includes(name) && !configured(environment[name]),
  );

  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "PASSWORD_RESET_ORIGIN"]) {
    if (!missing.includes(name) && !validHttpsOrigin(environment[name]) && !invalid.includes(name)) {
      invalid.push(name);
    }
  }

  if (
    !missing.includes("NEXT_PUBLIC_SUPPORT_EMAIL") &&
    !invalid.includes("NEXT_PUBLIC_SUPPORT_EMAIL") &&
    !validEmailAddress(environment.NEXT_PUBLIC_SUPPORT_EMAIL)
  ) {
    invalid.push("NEXT_PUBLIC_SUPPORT_EMAIL");
  }

  const aiReady =
    options.vercelRuntime === true || AI_CREDENTIAL_NAMES.some((name) => configured(environment[name]));
  const missingAlternatives = aiReady ? [] : [AI_CREDENTIAL_NAMES.join(" or ")];
  const configuredVideoSigningNames = VIDEO_SIGNING_ENV_NAMES.filter((name) => configured(environment[name]));
  if (
    configuredVideoSigningNames.length === 1 ||
    (options.requireSignedVideo === true && configuredVideoSigningNames.length !== VIDEO_SIGNING_ENV_NAMES.length)
  ) {
    missingAlternatives.push(`${VIDEO_SIGNING_ENV_NAMES.join(" and ")} together`);
  }

  return { missing, invalid, missingAlternatives, ok: missing.length + invalid.length + missingAlternatives.length === 0 };
}

export function evaluateDeployEnvironment(environment) {
  const missing = DEPLOY_REQUIRED_ENV_NAMES.filter((name) => !environment[name]?.trim());
  const invalid = DEPLOY_REQUIRED_ENV_NAMES.filter(
    (name) => !missing.includes(name) && !configured(environment[name]),
  );
  return { missing, invalid, missingAlternatives: [], ok: missing.length + invalid.length === 0 };
}

export function formatPreflightResult(result, label = "Launch") {
  if (result.ok) return `${label} preflight passed. Required environment names are configured.`;

  const lines = [`${label} preflight failed.`];
  if (result.missing.length) lines.push(`Missing names: ${result.missing.join(", ")}`);
  if (result.invalid.length) lines.push(`Invalid or placeholder names: ${result.invalid.join(", ")}`);
  if (result.missingAlternatives.length) {
    lines.push(`Missing credential alternatives: ${result.missingAlternatives.join(", ")}`);
  }
  return lines.join("\n");
}

function argumentValue(argumentsList, name) {
  const exactIndex = argumentsList.indexOf(name);
  if (exactIndex >= 0) return argumentsList[exactIndex + 1] ?? null;
  const prefix = `${name}=`;
  const inline = argumentsList.find((argument) => argument.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : null;
}

async function environmentFromFile(filePath) {
  if (!filePath) return {};
  return parseEnvironmentFile(await readFile(resolve(filePath), "utf8"));
}

async function main() {
  const argumentsList = process.argv.slice(2);
  const examplePath = argumentValue(argumentsList, "--check-example");

  if (examplePath) {
    const declared = parseEnvironmentFile(await readFile(resolve(examplePath), "utf8"));
    const expectedNames = [
      ...APP_REQUIRED_ENV_NAMES,
      "AI_GATEWAY_API_KEY",
      "INSUCCESS_AI_MODEL",
      "INSUCCESS_ASSESSMENT_MODEL",
      ...VIDEO_SIGNING_ENV_NAMES,
    ];
    const missing = expectedNames.filter((name) => !(name in declared));
    if (missing.length) {
      console.error(`Environment contract failed. Missing names: ${missing.join(", ")}`);
      process.exitCode = 1;
    } else {
      console.log("Environment contract passed. Required environment names are declared.");
    }
    return;
  }

  const fileEnvironment = await environmentFromFile(argumentValue(argumentsList, "--env-file"));
  const environment = { ...fileEnvironment, ...process.env };
  const deployOnly = argumentsList.includes("--deploy");
  const result = deployOnly
    ? evaluateDeployEnvironment(environment)
    : evaluateLaunchEnvironment(environment, {
        vercelRuntime: argumentsList.includes("--vercel-runtime"),
        requireSignedVideo: argumentsList.includes("--require-signed-video"),
      });

  console.log(formatPreflightResult(result, deployOnly ? "Deployment credential" : "Launch"));
  if (!result.ok) process.exitCode = 1;
}

const directInvocation = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (directInvocation) {
  main().catch(() => {
    console.error("Preflight could not read the requested environment source. No values were printed.");
    process.exitCode = 1;
  });
}
