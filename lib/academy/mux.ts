import "server-only";

import { createSign } from "node:crypto";
import type { AcademyPlaybackPolicy } from "./contracts";

type MuxAudience = "v" | "t" | "s";

export class MuxConfigurationError extends Error {}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function signingConfiguration(): { keyId: string; privateKey: string } {
  const keyId = process.env.MUX_SIGNING_KEY_ID?.trim();
  const configuredKey = process.env.MUX_SIGNING_PRIVATE_KEY?.trim();

  if (!keyId || !configuredKey) {
    throw new MuxConfigurationError("Signed Mux playback-ийн server key тохируулаагүй байна.");
  }

  const normalized = configuredKey.includes("BEGIN")
    ? configuredKey.replaceAll("\\n", "\n")
    : Buffer.from(configuredKey, "base64").toString("utf8");

  if (!normalized.includes("BEGIN") || !normalized.includes("PRIVATE KEY")) {
    throw new MuxConfigurationError("MUX_SIGNING_PRIVATE_KEY нь base64 PEM эсвэл PEM утга байх ёстой.");
  }

  return { keyId, privateKey: normalized };
}

function signMuxToken(
  playbackId: string,
  audience: MuxAudience,
  expiresAtSeconds: number,
  configuration: { keyId: string; privateKey: string },
): string {
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: configuration.keyId }));
  const payload = base64Url(JSON.stringify({ sub: playbackId, aud: audience, exp: expiresAtSeconds }));
  const unsignedToken = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign(configuration.privateKey).toString("base64url");
  return `${unsignedToken}.${signature}`;
}

export function buildMuxPlayback(input: {
  playbackId: string;
  policy: AcademyPlaybackPolicy;
  lessonId: string;
  title: string;
  resumeAtSeconds: number;
  durationSeconds: number | null;
}) {
  const safeResumeAt = Math.max(0, Math.floor(input.resumeAtSeconds));
  const embedUrl = new URL(`https://player.mux.com/${encodeURIComponent(input.playbackId)}`);
  embedUrl.searchParams.set("metadata-video-id", input.lessonId);
  embedUrl.searchParams.set("metadata-video-title", input.title);
  embedUrl.searchParams.set("disable-cookies", "true");
  embedUrl.searchParams.set("preload", "metadata");
  if (safeResumeAt > 0) embedUrl.searchParams.set("start-time", String(safeResumeAt));

  if (input.policy === "public") {
    return {
      streamUrl: `https://stream.mux.com/${encodeURIComponent(input.playbackId)}.m3u8`,
      embedUrl: embedUrl.toString(),
      posterUrl: `https://image.mux.com/${encodeURIComponent(input.playbackId)}/thumbnail.webp?time=0&width=1600`,
      expiresAt: null,
    };
  }

  const configuration = signingConfiguration();
  const ttlSeconds = Math.min(
    86_400,
    Math.max(3_600, Math.ceil(input.durationSeconds ?? 0) + 1_800),
  );
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + ttlSeconds;
  const playbackToken = signMuxToken(input.playbackId, "v", expiresAtSeconds, configuration);
  const thumbnailToken = signMuxToken(input.playbackId, "t", expiresAtSeconds, configuration);
  const storyboardToken = signMuxToken(input.playbackId, "s", expiresAtSeconds, configuration);

  embedUrl.searchParams.set("playback-token", playbackToken);
  embedUrl.searchParams.set("thumbnail-token", thumbnailToken);
  embedUrl.searchParams.set("storyboard-token", storyboardToken);

  return {
    streamUrl: `https://stream.mux.com/${encodeURIComponent(input.playbackId)}.m3u8?token=${encodeURIComponent(playbackToken)}`,
    embedUrl: embedUrl.toString(),
    posterUrl: `https://image.mux.com/${encodeURIComponent(input.playbackId)}/thumbnail.webp?token=${encodeURIComponent(thumbnailToken)}`,
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
  };
}
