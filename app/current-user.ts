import { headers } from "next/headers";
import { getChatGPTUser, type ChatGPTUser } from "./chatgpt-auth";

export async function getCurrentTeamOsUser(): Promise<ChatGPTUser | null> {
  const signedIn = await getChatGPTUser();
  if (signedIn) return signedIn;

  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "";
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    return {
      userId: "local-preview-user",
      displayName: "Багийн удирдагч",
      email: "preview@team-os.local",
      fullName: "Багийн удирдагч",
    };
  }

  return null;
}
