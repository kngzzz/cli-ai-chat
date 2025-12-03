import type { ChatMessage } from "../types";

export function buildChatPrompt(
  history: ChatMessage[],
  latestUserInput: string,
  maxHistory: number,
): string {
  const recent: ChatMessage[] = [];

  for (let i = history.length - 1; i >= 0 && recent.length < maxHistory; i--) {
    const msg = history[i];
    const metaKind = (msg.meta as { kind?: string } | undefined)?.kind;
    const isDialogue = msg.role === "user" || msg.role === "assistant";
    const isContextual = metaKind === "context" || metaKind === "sample" || metaKind === "tool_summary";
    if (isDialogue && !isContextual) {
      recent.unshift(msg);
    }
  }


  const lines: string[] = ["You are an AI coding assistant.", ""];

  for (const msg of recent) {
    const roleLabel = msg.role === "user" ? "User" : "Assistant";
    lines.push(`${roleLabel}: ${msg.text}`);
    lines.push("");
  }

  lines.push(`User: ${latestUserInput}`);
  lines.push("");
  lines.push("Assistant:");

  return lines.join("\n");
}
