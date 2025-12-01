import { describe, expect, it } from "vitest";

import type { ChatMessage } from "../src/types";
import { buildChatPrompt } from "../src/utils/prompt";

const baseHistory: ChatMessage[] = [
  { id: "1", role: "user", text: "How are you?", timestamp: 1 },
  { id: "2", role: "assistant", text: "Great!", timestamp: 2 },
];

describe("buildChatPrompt", () => {
  it("includes latest input once without duplicating", () => {
    const prompt = buildChatPrompt(baseHistory, "unique-user-input", 6);
    const count = prompt.split("unique-user-input").length - 1;
    expect(count).toBe(1);
  });

  it("respects max history limit", () => {
    const longHistory: ChatMessage[] = [
      ...baseHistory,
      { id: "3", role: "user", text: "Tell me more", timestamp: 3 },
      { id: "4", role: "assistant", text: "Sure thing", timestamp: 4 },
    ];
    const prompt = buildChatPrompt(longHistory, "latest-question", 2);
    expect(prompt).toContain("Assistant: Sure thing");
    expect(prompt).not.toContain("How are you?");
  });

  it("ignores non-conversation roles in history", () => {
    const historyWithTool: ChatMessage[] = [
      ...baseHistory,
      { id: "tool", role: "tool", text: "internal detail", timestamp: 3 },
    ];
    const prompt = buildChatPrompt(historyWithTool, "latest", 6);
    expect(prompt).not.toContain("internal detail");
    expect(prompt).toContain("User: latest");
  });
});
