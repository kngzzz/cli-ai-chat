import { Notice, Platform, Plugin } from "obsidian";
import { spawnSync } from "child_process";
import path from "path";

import {
  ChatMessage,
  ClaudeSpawnConfig,
  ChatSettings,
  DEFAULT_SETTINGS,
  VIEW_TYPE_CLI_CHAT,
  ProcessHandle,
  ToolEventCallback,
} from "../types";
import {
  getVaultPath,
  sanitizeBinaryInput,
  sanitizeWorkingDirectoryInput,
  toWslPath,
} from "../utils";
import { STARTER_COMMAND_FILES, STARTER_SKILL_FILES } from "./assets";
import { ClaudeStreamSession } from "./claude-session";
import { SettingsStore } from "./settings-store";
import ChatView from "../ui/view";
import ChatSettingTab from "../settings/tab";

export default class ChatPlugin extends Plugin {
  settings: ChatSettings = { ...DEFAULT_SETTINGS };
  settingsStore = new SettingsStore(this);
  claudeSession: ClaudeStreamSession | null = null;
  private claudeAssetsSeeded = false;

  async onload(): Promise<void> {
    await this.loadSettings();

    if (!Platform.isDesktopApp) {
      new Notice("CLI AI Chat only works on desktop (needs local CLI binaries).");
      return;
    }

    // Backward compatibility: ensure newly added fields exist
    this.settings = { ...DEFAULT_SETTINGS, ...this.settings };

    // If running on non-Windows, force shell mode to native to avoid missing wsl
    if (process.platform !== "win32" && this.settings.shellMode === "wsl") {
      this.settings.shellMode = "native";
    }

    await this.saveSettings();

    this.registerView(
      VIEW_TYPE_CLI_CHAT,
      (leaf) => new ChatView(leaf, this),
    );

    this.addRibbonIcon("bot", "CLI AI Chat", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open-view",
      name: "Open view",
      callback: () => this.activateView(),
    });

    this.addSettingTab(new ChatSettingTab(this.app, this));

    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.ensureViewExists().catch((err) =>
          console.error("Failed to ensure CLI AI Chat view:", err),
        );
      }),
    );
  }

  onunload(): void {
    // Obsidian automatically detaches custom leaves during unload
    this.resetClaudeSession();
  }

  async activateView(): Promise<void> {
    await this.ensureViewExists();
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CLI_CHAT);
    if (leaves.length > 0) {
      void this.app.workspace.revealLeaf(leaves[0]);
    }
  }

  private async ensureViewExists(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CLI_CHAT);
    if (leaves.length === 0) {
      const right =
        this.app.workspace.getRightLeaf(false) ??
        this.app.workspace.getRightLeaf(true);
      if (right) {
        await right.setViewState({
          type: VIEW_TYPE_CLI_CHAT,
          active: true,
        });
      }
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.settings.claudeBinary = sanitizeBinaryInput(this.settings.claudeBinary) ?? DEFAULT_SETTINGS.claudeBinary;
    this.settings.customWorkingDirectory =
      sanitizeWorkingDirectoryInput(this.settings.customWorkingDirectory) ?? "";
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  resetClaudeSession(): void {
    if (this.claudeSession) {
      this.claudeSession.dispose();
      this.claudeSession = null;
    }
  }

  getWorkingDirectoryPath(): string | null {
    return this.getWorkingDirectory();
  }

  private getWorkingDirectory(): string | null {
    const fallback = getVaultPath(this.app) ?? process.cwd();
    if (this.settings.workingDirectoryMode !== "custom") {
      return fallback;
    }
    const sanitized = sanitizeWorkingDirectoryInput(this.settings.customWorkingDirectory);
    if (!sanitized) {
      console.error("Invalid custom working directory; falling back to vault.");
      return fallback;
    }
    return sanitized;
  }

  private buildClaudeStreamSpawnConfig(cwd: string | null): ClaudeSpawnConfig | { error: string } {
    const shellMode = this.settings.shellMode ?? "native";
    const preferredBinary = this.settings.claudeBinary?.trim?.() || DEFAULT_SETTINGS.claudeBinary;

    const binary = shellMode === "wsl"
      ? this.resolveBinaryInWsl(preferredBinary)
      : this.resolveBinary(preferredBinary, DEFAULT_SETTINGS.claudeBinary);

    if (shellMode === "wsl" && !binary) {
      return {
        error: `Could not find "${preferredBinary}" in WSL PATH. Set Binary to a full path or install the CLI in WSL.`,
      };
    }

    const resolvedBinary = binary || preferredBinary;

    const extraArgsRaw = this.settings.claudeExtraArgs ?? "";
    const extraArgs = extraArgsRaw
      .split(/\s+/)
      .filter(Boolean)
      .filter((a) => !a.startsWith("--output-format") && !a.startsWith("--input-format") && a !== "--verbose");

    const args = ["--output-format=stream-json", "--input-format=stream-json", "--verbose"];
    const model = this.settings.claudeModel?.trim?.();
    if (model) {
      args.push("--model", model);
    }
    args.push(...extraArgs);


    const options: Record<string, unknown> = { shell: false };
    let command = resolvedBinary;
    let finalArgs = args;

    if (shellMode === "wsl") {
      const wslExists = spawnSync("wsl", ["--status"]);
      if (wslExists.status !== 0) {
        return { error: "WSL is not available. Install WSL or switch Execution mode to Native." };
      }
      const wslArgs: string[] = [];
      if (cwd) {
        wslArgs.push("--cd", toWslPath(cwd));
      }
      wslArgs.push(resolvedBinary, ...args);
      command = "wsl";
      finalArgs = wslArgs;
    } else if (cwd) {
      options.cwd = cwd;
    }

    return { command, args: finalArgs, options };
  }


  private tryResolveBinary(preferred: string): string | null {
    const cmd = process.platform === "win32" ? "where" : "which";
    const existingPaths = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
    const extraPaths =
      process.platform === "win32"
        ? [
            process.env.APPDATA ? path.join(process.env.APPDATA, "npm") : null,
            process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Roaming", "npm") : null,
            process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, "nodejs") : null,
          ]
        : [
            "/usr/local/bin",
            "/usr/local/sbin",
            "/opt/homebrew/bin",
            "/opt/homebrew/sbin",
            process.env.HOME ? path.join(process.env.HOME, ".local", "bin") : null,
          ];
    const pathParts = Array.from(
      new Set([...existingPaths, ...extraPaths.filter((p): p is string => Boolean(p))]),
    ).join(path.delimiter);

    const result = spawnSync(cmd, [preferred], { shell: true, env: { ...process.env, PATH: pathParts } });
    if (result.status === 0) {
      const stdout = result.stdout?.toString?.() ?? "";
      const candidate = stdout
        .split(/\r?\n/)
        .map((s: string) => s.trim())
        .find((s: string) => s.length > 0);
      return candidate || preferred;
    }
    return null;
  }

  private resolveBinary(preferred: string, fallback: string): string {
    const trimmed = preferred?.trim?.() ?? "";
    const candidate = trimmed.length > 0 ? trimmed : fallback;
    if (!this.settings.autoDetectBinaries) {
      return candidate;
    }
    const resolved = this.tryResolveBinary(candidate);
    return resolved ?? candidate;
  }

  private resolveBinaryInWsl(binary: string): string | null {
    const trimmed = binary?.trim?.();
    if (!trimmed) return null;
    if (trimmed.startsWith("/")) {
      return trimmed;
    }
    const result = spawnSync("wsl", ["command", "-v", trimmed]);
    if (result.status === 0) {
      const stdout = result.stdout?.toString?.() ?? "";
      const candidate = stdout
        .split(/\r?\n/)
        .map((s: string) => s.trim())
        .find((s: string) => s.length > 0);
      if (candidate) {
        return candidate;
      }
    }
    return null;
  }

  private logDebug(...args: unknown[]): void {
    if (this.settings.debugLogging && typeof console !== "undefined") {
      console.debug("[CLI AI Chat][debug]", ...args);
    }
  }


  runCliCompletion(
    prompt: string,
    onChunk: (chunk: string, fullText: string) => void,
    onError: (errText: string) => void,
    onDone: () => void,
    onToolEvent?: ToolEventCallback,
  ): ProcessHandle | null {
    const shellMode = this.settings.shellMode ?? "native";
    const cwd = this.getWorkingDirectory();

    if (shellMode === "wsl" && process.platform !== "win32") {
      onError("WSL mode is only supported on Windows. Switch Execution mode to Native in settings.");
      onDone();
      return null;
    }

    const config = this.buildClaudeStreamSpawnConfig(cwd);
    if ("error" in config) {
      onError(config.error);
      onDone();
      return null;
    }
    const spawnConfig = config;

    if (!this.claudeSession) {
      this.claudeSession = new ClaudeStreamSession(
        () => {
          const generated = this.buildClaudeStreamSpawnConfig(this.getWorkingDirectory());
          if ("error" in generated) {
            throw new Error(generated.error);
          }
          return generated;
        },
        this.logDebug.bind(this),
      );
    }

    let finished = false;
    const timeoutMs = Math.max(
      this.settings.cliTimeoutMs ?? DEFAULT_SETTINGS.cliTimeoutMs,
      0,
    );
    const hasTimeout = timeoutMs >= 5000;
    let timeoutId: NodeJS.Timeout | null = null;
    const stopTimer = (): void => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
    const finish = (fn?: () => void): void => {
      if (finished) return;
      finished = true;
      stopTimer();
      fn?.();
    };
    const scheduleInactivityTimer = (): void => {
      if (!hasTimeout || finished) return;
      stopTimer();
      timeoutId = setTimeout(() => {
        finish(() => {
          this.resetClaudeSession();
          onError(`CLI timed out after ${timeoutMs} ms of inactivity.`);
          onDone();
        });
      }, timeoutMs);
    };
    const stopHandle = {
      kill: (_signal?: unknown) => {
        finish(() => {
          this.resetClaudeSession();
          onDone();
        });
      },
    };

    this.logDebug(
      "Running Claude stream",
      JSON.stringify({
        mode: shellMode,
        command: spawnConfig.command,
        args: spawnConfig.args,
        cwd: spawnConfig.options?.cwd ?? cwd,
      }),
    );

    this.claudeSession.send(
      prompt,
      (chunk, fullText) => {
        if (finished) return;
        scheduleInactivityTimer();
        onChunk(chunk, fullText);
      },
      (errText) => {
        finish(() => {
          onError(errText);
          onDone();
        });
      },
      () => {
        finish(() => {
          onDone();
        });
      },
      (toolEvt) => {
        if (finished) return;
        scheduleInactivityTimer();
        if (onToolEvent) {
          onToolEvent(toolEvt);
        }
      },
    );

    scheduleInactivityTimer();

    return stopHandle;
  }


  async exportConversation(messages: ChatMessage[]): Promise<string> {
    const folder = (this.settings.exportFolder || DEFAULT_SETTINGS.exportFolder).trim();
    const safeFolder = folder.length > 0 ? folder : DEFAULT_SETTINGS.exportFolder;
    const stamp = new Date();
    const fileName = `chat-${
      stamp.toISOString().replace(/[:]/g, "-").replace(/\..+$/, "")
    }.md`;
    const path = `${safeFolder}/${fileName}`;

    await this.ensureFolderExists(safeFolder);

    const lines: string[] = [];
    lines.push("# CLI AI Chat export");
    lines.push(`Exported: ${stamp.toLocaleString()}`);
    lines.push("");

    for (const msg of messages) {
      const role = msg.role === "assistant" ? "Assistant" : msg.role === "user" ? "User" : "System";
      lines.push(`## ${role} (${new Date(msg.timestamp).toLocaleTimeString()})`);
      if (msg.meta?.kind === "context") {
        lines.push("(Context injected)");
      }
      lines.push("```");
      lines.push(msg.text.trim());
      lines.push("```");
      lines.push("");
    }

    await this.app.vault.adapter.write(path, lines.join("\n"));
    return path;
  }

  private async ensureFolderExists(folder: string): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(folder);
    if (!existing) {
      await this.app.vault.createFolder(folder);
    }
  }

  private async ensureFileWithContent(path: string, content: string): Promise<boolean> {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing) return false;
    const parts = path.split("/");
    parts.pop();
    const parent = parts.join("/");
    if (parent) {
      await this.ensureFolderExists(parent);
    }
    await this.app.vault.create(path, content);
    return true;
  }

  async ensureClaudeStarterAssets(force = false): Promise<void> {
    if (this.claudeAssetsSeeded && !force) return;
    try {
      await this.ensureFolderExists(".claude");
      await this.ensureFolderExists(".claude/commands");
      await this.ensureFolderExists(".claude/skills");

      for (const file of STARTER_COMMAND_FILES) {
        await this.ensureFileWithContent(file.path, file.content);
      }
      for (const file of STARTER_SKILL_FILES) {
        await this.ensureFileWithContent(file.path, file.content);
      }
    } catch (err) {
      console.error("Failed to ensure Claude starter assets", err);
    } finally {
      this.claudeAssetsSeeded = true;
    }
  }
}
