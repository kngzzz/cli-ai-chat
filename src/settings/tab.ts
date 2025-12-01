import { App, Notice, PluginSettingTab, Setting, WorkspaceLeaf } from "obsidian";

import ChatView from "../ui/view";
import type ChatPlugin from "../core/plugin";
import {
  CLAUDE_MODEL_OPTIONS,
  DEFAULT_SETTINGS,
  VIEW_TYPE_CLI_CHAT,
} from "../types";
import { collectClaudeCommandNames, collectClaudeSkillNames } from "../commands";
import { sanitizeBinaryInput, sanitizeWorkingDirectoryInput } from "../utils";

export default class ChatSettingTab extends PluginSettingTab {
  plugin: ChatPlugin;

  constructor(app: App, plugin: ChatPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "CLI AI Chat" });


    new Setting(containerEl)
      .setName("Auto-detect binaries")
      .setDesc("Try to resolve CLI binaries with which/where when the path is blank.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoDetectBinaries)
          .onChange(async (value) => {
            await this.plugin.settingsStore.update({ autoDetectBinaries: value });
          }),
      );

    new Setting(containerEl)
      .setName("Confirm before run")
      .setDesc("If enabled, asks for confirmation before starting a CLI run.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.confirmBeforeRun)
          .onChange(async (value) => {
            await this.plugin.settingsStore.update({ confirmBeforeRun: value });
          }),
      );

    containerEl.createEl("h3", { text: "Claude CLI" });


    new Setting(containerEl)
      .setName("Binary")
      .setDesc("Name of the Claude CLI binary (letters, numbers, dots, underscores, hyphens).")
      .addText((text) =>
        text
          .setPlaceholder("claude")
          .setValue(this.plugin.settings.claudeBinary)
          .onChange(async (value) => {
            const sanitized = sanitizeBinaryInput(value);
            if (value.trim().length > 0 && !sanitized) {
              new Notice("Invalid binary name. Use letters, numbers, dots, underscores, or hyphens.");
              return;
            }
            await this.plugin.settingsStore.update({
              claudeBinary: sanitized ?? DEFAULT_SETTINGS.claudeBinary,
            });
          }),
      );

    new Setting(containerEl)
      .setName("Extra arguments")
      .setDesc(
        "Extra arguments for Claude CLI (space-separated). Prompts already stream over stdin, so no '-p' flag is needed—keep streaming formats like '--output-format text' or JSON.",
      )
      .addText((text) =>
        text
          .setPlaceholder("--output-format text")
          .setValue(this.plugin.settings.claudeExtraArgs)
          .onChange(async (value) => {
            await this.plugin.settingsStore.update({ claudeExtraArgs: value });
          }),
      );

    new Setting(containerEl)
      .setName("Claude model")
      .setDesc("Choose which Claude Code model to run for chats.")
      .addDropdown((dropdown) => {
        CLAUDE_MODEL_OPTIONS.forEach((option) => dropdown.addOption(option.id, option.label));
        dropdown.setValue(this.plugin.settings.claudeModel ?? DEFAULT_SETTINGS.claudeModel);
        dropdown.onChange(async (value) => {
          const match = CLAUDE_MODEL_OPTIONS.find((option) => option.id === value);
          const nextModel = match ? match.id : DEFAULT_SETTINGS.claudeModel;
          await this.plugin.settingsStore.update({ claudeModel: nextModel });
          this.plugin.app.workspace
            .getLeavesOfType(VIEW_TYPE_CLI_CHAT)
            .forEach((leaf: WorkspaceLeaf) => {
              const view = leaf.view;
              if (view instanceof ChatView) {
                view.refreshModelSelector();
              }
            });
        });
      });
 
    containerEl.createEl("h3", { text: "Working directory" });


    new Setting(containerEl)
      .setName("Working directory mode")
      .setDesc(
        "Use the vault folder or a custom directory as the CLI working directory.",
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("vault", "Vault folder")
          .addOption("custom", "Custom path")
          .setValue(this.plugin.settings.workingDirectoryMode)
          .onChange(async (value: string) => {
            const mode: "vault" | "custom" = value === "custom" ? "custom" : "vault";
            await this.plugin.settingsStore.update({ workingDirectoryMode: mode });
            this.display();
          }),
      );

    new Setting(containerEl)
      .setName("Execution mode")
      .setDesc(
        "Run CLIs directly on this system or through WSL (Windows Subsystem for Linux). Use WSL if OpenCode/Claude are installed only in WSL.",
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("native", "Native (Windows/macOS/Linux)")
          .addOption("wsl", "WSL (Windows only)")
          .setValue(this.plugin.settings.shellMode ?? "native")
          .onChange(async (value: string) => {
            const mode: "native" | "wsl" = value === "wsl" ? "wsl" : "native";
            await this.plugin.settingsStore.update({ shellMode: mode });
            this.display();
          }),
      );

    if (this.plugin.settings.shellMode === "wsl") {
      new Setting(containerEl)
        .setName("WSL bash wrapper")
        .setDesc(
          "Deprecated. For security reasons commands run directly via WSL even if this toggle is enabled.",
        )
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.wslUseBash)
            .onChange(async (value) => {
              await this.plugin.settingsStore.update({ wslUseBash: value });
            }),
        );
    }

    if (this.plugin.settings.workingDirectoryMode === "custom") {
      new Setting(containerEl)
        .setName("Custom working directory")
        .setDesc("Absolute path to run the CLI commands in (no '..' segments).")
        .addText((text) =>
          text
            .setPlaceholder("/path/to/project")
            .setValue(this.plugin.settings.customWorkingDirectory)
            .onChange(async (value) => {
              const sanitized = sanitizeWorkingDirectoryInput(value ?? "");
              if (value.trim().length > 0 && !sanitized) {
                new Notice("Enter an absolute path without '..' segments.");
                return;
              }
              await this.plugin.settingsStore.update({ customWorkingDirectory: sanitized ?? "" });
            }),
        );
    }

    containerEl.createEl("h3", { text: "Context" });

    new Setting(containerEl)
      .setName("Include file context")
      .setDesc("Append the current note path to your message.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeFileContext)
          .onChange(async (value) => {
            await this.plugin.settingsStore.update({ includeFileContext: value });
          }),
      );

    new Setting(containerEl)
      .setName("Include selection")
      .setDesc("When enabled, selected text is added to the prompt (truncated).")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeSelection)
          .onChange(async (value) => {
            await this.plugin.settingsStore.update({ includeSelection: value });
          }),
      );

    new Setting(containerEl)
      .setName("Selection character limit")
      .setDesc("Maximum characters of selected text to include.")
      .addText((text) =>
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.selectionCharLimit))
          .setValue(String(this.plugin.settings.selectionCharLimit))
          .onChange(async (value) => {
            const n = Number(value);
            if (!Number.isNaN(n) && n > 0) {
              await this.plugin.settingsStore.update({ selectionCharLimit: n });
            }
          }),
      );

    containerEl.createEl("h3", { text: "Conversation" });

    new Setting(containerEl)
      .setName("Max history messages")
      .setDesc(
        "How many recent messages to include in the prompt sent to the CLI.",
      )
      .addText((text) =>
        text
          .setPlaceholder("6")
          .setValue(String(this.plugin.settings.maxHistoryMessages))
          .onChange(async (value) => {
            const n = Number(value);
            if (!Number.isNaN(n) && n > 0 && n <= 50) {
              await this.plugin.settingsStore.update({ maxHistoryMessages: n });
            }
          }),
      );

    new Setting(containerEl)
      .setName("Compact tool calls")
      .setDesc("Group Claude's tool usage into a single summary card.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.compactToolCalls)
          .onChange(async (value) => {
            await this.plugin.settingsStore.update({ compactToolCalls: value });
          this.plugin.app.workspace
            .getLeavesOfType(VIEW_TYPE_CLI_CHAT)
            .forEach((leaf: WorkspaceLeaf) => {
              const view = leaf.view;
              if (view instanceof ChatView) {
                view.handleCompactSettingChange();
              }
            });

          }),
      );
 
    containerEl.createEl("h3", { text: "Export & diagnostics" });


    new Setting(containerEl)
      .setName("Export folder")
      .setDesc("Relative path inside the vault for Markdown exports.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.exportFolder)
          .setValue(this.plugin.settings.exportFolder)
          .onChange(async (value) => {
            await this.plugin.settingsStore.update({ exportFolder: value });
          }),
      );

    new Setting(containerEl)
      .setName("Debug logging")
      .setDesc("Log CLI calls and stderr to the console.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.debugLogging)
          .onChange(async (value) => {
            await this.plugin.settingsStore.update({ debugLogging: value });
          }),
      );

    new Setting(containerEl)
      .setName("CLI timeout (ms)")
      .setDesc("Kill the CLI if it runs longer than this duration (min 5000 ms).")
      .addText((text) =>
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.cliTimeoutMs))
          .setValue(String(this.plugin.settings.cliTimeoutMs))
          .onChange(async (value) => {
            const n = Number(value);
            if (!Number.isNaN(n) && n >= 5000) {
              await this.plugin.settingsStore.update({ cliTimeoutMs: n });
            }
          }),
      );

    containerEl.createEl("h3", { text: "Claude commands & skills" });

    new Setting(containerEl)
      .setName("Starter files")
      .setDesc("Create starter Claude commands/skills in the .claude folder (runs once).")
      .addButton((button) =>
        button
          .setButtonText("Create starter files")
          .onClick(async () => {
            await this.plugin.ensureClaudeStarterAssets(true);
            new Notice("Starter Claude commands and skills added (if missing).");
            this.display();
          }),
      );

    const workingDirectory = this.plugin.getWorkingDirectoryPath();
    const claudeCommands = collectClaudeCommandNames(
      this.app,
      workingDirectory,
    )
      .map((name) => `/${name}`)
      .sort((a, b) => a.localeCompare(b));
    const claudeSkills = collectClaudeSkillNames(
      this.app,
      workingDirectory,
    ).sort((a, b) => a.localeCompare(b));

    new Setting(containerEl)
      .setName("Commands detected")
      .setDesc(claudeCommands.length > 0 ? claudeCommands.join(", ") : "None detected");

    new Setting(containerEl)
      .setName("Skills detected")
      .setDesc(claudeSkills.length > 0 ? claudeSkills.join(", ") : "None detected");
  }
}
