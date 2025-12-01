export type ChatRole = "user" | "assistant" | "tool" | "system" | "error";

export type ToolStatus = "running" | "done" | "error";

export type ToolMeta = {
  kind: "tool_call" | "tool_result";
  toolId?: string;
  toolName?: string;
  toolTitle?: string;
  toolStatus?: ToolStatus;
  toolCommand?: string;
  toolPath?: string;
  exitCode?: number;
};

export const CLAUDE_MODEL_OPTIONS = [
  { id: "default", label: "Default (recommended)" },
  { id: "sonnet", label: "Sonnet 4.5" },
  { id: "haiku", label: "Haiku" },
  { id: "opus", label: "Opus 4.1" },
  { id: "opusplan", label: "Opus Plan (plan w/ Opus, execute w/ Sonnet)" },
] as const;

export type ClaudeModelId = (typeof CLAUDE_MODEL_OPTIONS)[number]["id"];

export type ClaudeSpawnConfig = {
  command: string;
  args: string[];
  options?: Record<string, unknown>;
};

export type PlanMeta = {
  kind: "plan";
  stepIndex?: number;
  totalSteps?: number;
};

export type ContextMeta = {
  kind?: "context" | "sample";
};

export type ToolSummaryMeta = {
  kind: "tool_summary";
};

export type ToolSummaryState = {
  id: string;
  totalCalls: number;
  toolCounts: Record<string, number>;
  errorCount: number;
  seenToolIds: Set<string>;
};

export type MentionSuggestion = {
  basename: string;
  path: string;
  display: string;
};

export type SlashSuggestion = {
  name: string;
  description?: string;
  source: "builtin" | "claude";
};

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  timestamp: number;
  meta?: ToolMeta | PlanMeta | ContextMeta | ToolSummaryMeta;
}

export interface ChatSettings {
  claudeBinary: string;
  claudeExtraArgs: string;
  claudeModel: ClaudeModelId;
  shellMode: "native" | "wsl";
  wslUseBash: boolean;
  workingDirectoryMode: "vault" | "custom";
  customWorkingDirectory: string;
  maxHistoryMessages: number;
  includeFileContext: boolean;
  includeSelection: boolean;
  selectionCharLimit: number;
  compactToolCalls: boolean;
  debugLogging: boolean;
  exportFolder: string;
  autoDetectBinaries: boolean;
  confirmBeforeRun: boolean;
  cliTimeoutMs: number;
}

export const VIEW_TYPE_CLI_CHAT = "cli-ai-chat-view";

export const DEFAULT_SETTINGS: ChatSettings = {
  claudeBinary: "claude",
  claudeExtraArgs:
    "--output-format=stream-json --input-format=stream-json --include-partial-messages --dangerously-skip-permissions",
  claudeModel: "default",
  shellMode: "native",
  wslUseBash: true,
  workingDirectoryMode: "vault",
  customWorkingDirectory: "",
  maxHistoryMessages: 6,
  includeFileContext: true,
  includeSelection: false,
  selectionCharLimit: 800,
  compactToolCalls: false,
  debugLogging: false,
  exportFolder: "AI Chat Exports",
  autoDetectBinaries: true,
  confirmBeforeRun: false,
  cliTimeoutMs: 45000,
};

export const BINARY_NAME_REGEX = /^[a-zA-Z0-9._-]+$/;
export const MAX_RENDERED_MESSAGES = 200;
