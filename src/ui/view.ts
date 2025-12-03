import {
  App,
  FileSystemAdapter,
  ItemView,
  MarkdownRenderer,
  MarkdownView,
  Menu,
  Modal,
  Notice,
  setIcon,
  TAbstractFile,
  TFile,
  WorkspaceLeaf,
} from "obsidian";

import type ChatPlugin from "../core/plugin";
import {
  ChatMessage,
  MentionSuggestion,
  SlashSuggestion,
  ToolMeta,
  ToolStatus,
  ToolSummaryState,
  VIEW_TYPE_CLI_CHAT,
  ContextMeta,
  PlanMeta,
  MAX_RENDERED_MESSAGES,
  CLAUDE_MODEL_OPTIONS,
  ProcessHandle,
  ToolEventPayload,
  ContentBlock,
} from "../types";
import { BUILTIN_SLASH_COMMANDS, collectClaudeCommandNames } from "../commands";
import { buildChatPrompt } from "../utils/prompt";

class ConfirmModal extends Modal {
  private resolved = false;
  private resolvePromise: ((value: boolean) => void) | null = null;

  constructor(
    app: App,
    private message: string,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("p", { text: this.message });

    const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });

    const confirmBtn = buttonContainer.createEl("button", {
      text: "Confirm",
      cls: "mod-cta",
    });
    confirmBtn.addEventListener("click", () => {
      this.resolved = true;
      this.resolvePromise?.(true);
      this.close();
    });

    const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => {
      this.resolved = true;
      this.resolvePromise?.(false);
      this.close();
    });
  }

  onClose(): void {
    if (!this.resolved) {
      this.resolvePromise?.(false);
    }
    this.contentEl.empty();
  }

  waitForResult(): Promise<boolean> {
    this.resolved = false;
    this.resolvePromise = null;
    return new Promise<boolean>((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }
}

export default class ChatView extends ItemView {
  plugin: ChatPlugin;
  container!: HTMLElement;
  messagesWrapperEl!: HTMLElement;
  messagesEl!: HTMLElement;
  inputEl!: HTMLTextAreaElement;
  sendButtonEl!: HTMLButtonElement;
  providerBadgeEl!: HTMLElement;
  modelSelectEl!: HTMLButtonElement;
  toolDisplayToggleEl!: HTMLButtonElement;
  contextToggleEl!: HTMLButtonElement;
  mentionButtonEl!: HTMLButtonElement;

  loadingEl!: HTMLElement;
  loadingTextEl!: HTMLElement;
  slashHintEl!: HTMLElement;
  mentionMenuEl!: HTMLElement;
  mentionListEl!: HTMLElement;
  slashMenuEl!: HTMLElement;
  slashListEl!: HTMLElement;

  messages: ChatMessage[] = [];
  currentProcess: ProcessHandle | null = null;
  isStreaming = false;

  private mentionTriggerIndex = -1;
  private mentionQuery = "";
  private mentionItems: MentionSuggestion[] = [];
  private mentionHighlightIndex = 0;
  private mentionActive = false;
  private fileIndex: MentionSuggestion[] = [];
  private shouldAutoScroll = true;
  private toolSummary: ToolSummaryState | null = null;
  private toolSummaryMessageId: string | null = null;
  private slashTriggerIndex = -1;
  private slashQuery = "";
  private slashItems: SlashSuggestion[] = [];
  private slashHighlightIndex = 0;
  private slashActive = false;
  private slashCommandIndex: SlashSuggestion[] = [];
  private unsubscribeSettings?: () => void;

  constructor(leaf: WorkspaceLeaf, plugin: ChatPlugin) {
    super(leaf);
    this.plugin = plugin;
  }


  getViewType(): string {
    return VIEW_TYPE_CLI_CHAT;
  }

  getDisplayText(): string {
    return "CLI AI Chat";
  }

  getIcon(): string {
    return "bot";
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- Obsidian API requires Promise<void> return type
  async onOpen(): Promise<void> {
    this.containerEl.empty();

    this.container = this.containerEl.createDiv("cli-ai-chat-root");

    const headerEl = this.container.createDiv("cli-ai-chat-header");
    headerEl.createEl("span", {
      text: "CLI AI Chat",
      cls: "cli-ai-chat-title",
    });

    const headerActions = headerEl.createDiv("cli-ai-chat-actions");

    this.providerBadgeEl = headerActions.createEl("span", {
      cls: "cli-ai-chat-provider",
    });
    this.refreshProviderBadge();

    this.modelSelectEl = headerActions.createEl("button", {
      cls: "cli-ai-chat-chip",
      attr: { "aria-label": "Select Claude model" },
      text: "Model",
    });
    this.modelSelectEl.addEventListener("click", (evt) => {
      this.showClaudeModelMenu(evt);
    });
    this.refreshModelSelector();

    this.contextToggleEl = headerActions.createEl("button", {
      cls: "cli-ai-chat-icon-button",
      attr: { "aria-label": "Toggle Context" },
    });
    this.contextToggleEl.addEventListener("click", () => {
      const next = !this.plugin.settings.includeFileContext;
      void this.plugin.settingsStore.update({ includeFileContext: next });
      this.refreshContextToggle();
    });
    this.refreshContextToggle();

    this.mentionButtonEl = headerActions.createEl("button", {
      cls: "cli-ai-chat-icon-button",
      attr: { "aria-label": "Insert active note mention" },
    });
    setIcon(this.mentionButtonEl, "at-sign");
    this.mentionButtonEl.addEventListener("click", () => {
      this.insertMention();
    });

    this.toolDisplayToggleEl = headerActions.createEl("button", {
      cls: "cli-ai-chat-icon-button",
      attr: { "aria-label": "Toggle tool call display" },
    });
    this.toolDisplayToggleEl.addEventListener("click", () => {
      const next = !this.plugin.settings.compactToolCalls;
      void this.plugin.settingsStore.update({ compactToolCalls: next });
      this.handleCompactSettingChange();
    });
    this.refreshToolDisplayToggle();

    // Export button changed to a simple icon button
    const exportBtn = headerActions.createEl("button", {
      cls: "cli-ai-chat-icon-button",
      attr: { "aria-label": "Export chat to Markdown" },
    });
    setIcon(exportBtn, "download");
    exportBtn.addEventListener("click", () => {
      if (this.messages.length === 0) {
        new Notice("Nothing to export yet.");
        return;
      }
      void this.plugin.exportConversation(this.messages)
        .then((path: string) => {
          new Notice(`Chat exported to ${path}`);
        })
        .catch((err: unknown) => {
          console.error(err);
          new Notice("Failed to export chat.");
        });
    });

    this.messagesWrapperEl = this.container.createDiv("cli-ai-chat-messages-wrapper");
    this.messagesEl = this.messagesWrapperEl.createDiv("cli-ai-chat-messages");
    this.messagesWrapperEl.addEventListener("scroll", () => {
      this.updateAutoScrollFlag();
    });

    const inputWrapper = this.container.createDiv("cli-ai-chat-input-wrapper");
    this.inputEl = inputWrapper.createEl("textarea", {
      cls: "cli-ai-chat-input",
      attr: {
        rows: "1",
        placeholder: "Message...",
      },
    });

    this.mentionMenuEl = inputWrapper.createDiv("cli-ai-mention-menu hidden");
    this.mentionListEl = this.mentionMenuEl.createDiv("cli-ai-mention-list");
    this.slashMenuEl = inputWrapper.createDiv("cli-ai-slash-menu hidden");
    this.slashListEl = this.slashMenuEl.createDiv("cli-ai-slash-list");

    const controlsEl = inputWrapper.createDiv("cli-ai-chat-controls");


    this.loadingEl = controlsEl.createDiv("cli-ai-chat-loading hidden");
    this.loadingEl.setAttribute("role", "status");
    this.loadingEl.setAttribute("aria-live", "polite");
    this.loadingEl.createDiv("cli-ai-chat-spinner");
    this.loadingTextEl = this.loadingEl.createSpan({
      cls: "cli-ai-chat-loading-text",
      text: "Claude is thinking...",
    });

    this.sendButtonEl = controlsEl.createEl("button", {
      cls: "cli-ai-chat-send-icon",
      attr: { "aria-label": "Send message" },
    });
    setIcon(this.sendButtonEl, "send");

    this.sendButtonEl.addEventListener("click", () => {
      if (this.isStreaming) {
        this.stopStreaming();
      } else {
        void this.handleSend();
      }
    });

    this.inputEl.addEventListener("keydown", (evt: KeyboardEvent) => {
      this.handleInputKeydown(evt);
    });

    this.inputEl.addEventListener("input", () => {
      this.checkSlashTrigger();
      this.checkMentionTrigger();
      // Auto-resize using CSS custom property
      this.inputEl.setCssProps({ "--input-height": "auto" });
      this.inputEl.setCssProps({ "--input-height": `${this.inputEl.scrollHeight}px` });
    });

    this.inputEl.addEventListener("click", () => {
      this.checkSlashTrigger();
      this.checkMentionTrigger();
    });

    this.inputEl.addEventListener("keyup", (evt) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(evt.key)) {
        this.checkSlashTrigger();
        this.checkMentionTrigger();
      }
    });

    this.unsubscribeSettings = this.plugin.settingsStore.subscribe(() => {
      this.buildSlashCommandIndex();
    });

    this.initializeFileIndexWatchers();
    this.renderEmptyState();
  }


  // eslint-disable-next-line @typescript-eslint/require-await -- Obsidian API requires Promise<void> return type
  async onClose(): Promise<void> {
    this.stopStreaming();
    if (this.unsubscribeSettings) {
      this.unsubscribeSettings();
      this.unsubscribeSettings = undefined;
    }
  }

  refreshProviderBadge(): void {
    if (this.providerBadgeEl) {
      this.providerBadgeEl.textContent = "Claude Code";
    }
    this.refreshModelSelector();
  }

  private initializeFileIndexWatchers(): void {
    this.buildFileIndex();
    this.buildSlashCommandIndex();
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        this.handleFileCreated(file);
        this.buildSlashCommandIndex();
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.handleFileDeleted(file);
        this.buildSlashCommandIndex();
      }),
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.handleFileRenamed(file, oldPath);
        this.buildSlashCommandIndex();
      }),
    );
  }

  private buildFileIndex(): void {
    const files = this.app.vault.getFiles();
    this.fileIndex = files.map((file) => ({
      basename: file.basename,
      path: file.path,
      display: file.path,
    }));
    this.sortFileIndex();
  }

  private buildSlashCommandIndex(): void {
    const seen = new Set<string>();
    const entries: SlashSuggestion[] = [];

    for (const cmd of BUILTIN_SLASH_COMMANDS) {
      const key = cmd.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ ...cmd });
    }

    const claudeCommands = collectClaudeCommandNames(
      this.app,
      this.plugin.getWorkingDirectoryPath(),
    );
    claudeCommands.forEach((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      entries.push({
        name: key,
        description: "Custom Claude command",
        source: "claude",
      });
    });

    const builtIns = entries.filter((e) => e.source === "builtin");
    const claude = entries
      .filter((e) => e.source === "claude")
      .sort((a, b) => a.name.localeCompare(b.name));
    this.slashCommandIndex = [...builtIns, ...claude];
  }

  private handleFileCreated(file: TAbstractFile): void {
    if (!(file instanceof TFile)) return;
    this.addFileToIndex(file);
  }

  private handleFileDeleted(file: TAbstractFile): void {
    const filePath = file?.path;
    if (!filePath) return;
    this.fileIndex = this.fileIndex.filter((entry) => entry.path !== filePath);
  }

  private handleFileRenamed(file: TAbstractFile, oldPath: string): void {
    if (oldPath) {
      this.fileIndex = this.fileIndex.filter((entry) => entry.path !== oldPath);
    }
    if (file instanceof TFile) {
      this.addFileToIndex(file);
    }
  }

  private addFileToIndex(file: TFile): void {
    this.fileIndex.push({
      basename: file.basename,
      path: file.path,
      display: file.path,
    });
    this.sortFileIndex();
  }

  private sortFileIndex(): void {
    this.fileIndex.sort((a, b) => a.display.localeCompare(b.display));
  }

  refreshModelSelector(): void {
    if (!this.modelSelectEl) return;
    this.modelSelectEl.removeClass("cli-ai-chat-hidden");
    this.modelSelectEl.textContent = `Model: ${this.getClaudeModelLabel(this.plugin.settings.claudeModel)}`;
  }

  private refreshContextToggle(): void {
    if (!this.contextToggleEl) return;
    const active = this.plugin.settings.includeFileContext;
    // Remove old text if any
    this.contextToggleEl.empty();
    if (active) {
      setIcon(this.contextToggleEl, "file-check");
      this.contextToggleEl.classList.add("is-active");
    } else {
      setIcon(this.contextToggleEl, "file-minus");
      this.contextToggleEl.classList.remove("is-active");
    }
  }

  private refreshToolDisplayToggle(): void {
    if (!this.toolDisplayToggleEl) return;
    this.toolDisplayToggleEl.empty();
    const compact = this.plugin.settings.compactToolCalls;
    if (compact) {
      setIcon(this.toolDisplayToggleEl, "list-collapse");
    } else {
      setIcon(this.toolDisplayToggleEl, "list");
    }
  }

  handleCompactSettingChange(): void {
    const compact = this.plugin.settings.compactToolCalls;
    this.refreshToolDisplayToggle();
    if (compact) {
      this.setToolMessagesHidden(true);
      this.migrateExistingToolMessagesToSummary();
    } else {
      this.setToolMessagesHidden(false);
      this.clearToolSummaryMessage();
    }
  }

  private setToolMessagesHidden(hidden: boolean): void {
    if (!this.messagesEl) return;
    const nodes = this.messagesEl.getElementsByClassName("cli-ai-chat-message");
    this.messages.forEach((msg, index) => {
      if (msg.meta?.kind === "tool_call" || msg.meta?.kind === "tool_result") {
        const node = nodes.item(index) as HTMLElement | null;
        node?.classList.toggle("cli-ai-chat-tool-hidden", hidden);
      }
    });
  }

  private getClaudeModelLabel(id?: string): string {
    const option = CLAUDE_MODEL_OPTIONS.find((opt) => opt.id === id);
    return option?.label ?? CLAUDE_MODEL_OPTIONS[0].label;
  }

  private showClaudeModelMenu(evt: MouseEvent): void {
    const menu = new Menu();
    const current = this.plugin.settings.claudeModel;
    CLAUDE_MODEL_OPTIONS.forEach((option) => {
      menu.addItem((item) => {
        item.setTitle(option.label + (option.id === current ? " (selected)" : ""));
        item.onClick(() => {
          void this.plugin.settingsStore.update({ claudeModel: option.id });
          this.refreshModelSelector();
        });
      });
    });
    menu.showAtMouseEvent(evt);
  }

  private handleSlashNavigation(evt: KeyboardEvent): boolean {
    if (!this.slashActive || this.slashItems.length === 0) {
      return false;
    }
    if (evt.key === "ArrowDown") {
      evt.preventDefault();
      this.slashHighlightIndex = (this.slashHighlightIndex + 1) % this.slashItems.length;
      this.renderSlashMenu();
      return true;
    }
    if (evt.key === "ArrowUp") {
      evt.preventDefault();
      this.slashHighlightIndex =
        (this.slashHighlightIndex - 1 + this.slashItems.length) % this.slashItems.length;
      this.renderSlashMenu();
      return true;
    }
    if (evt.key === "Enter") {
      evt.preventDefault();
      this.selectSlashIndex(this.slashHighlightIndex);
      return true;
    }
    if (evt.key === "Escape") {
      evt.preventDefault();
      this.hideSlashMenu();
      return true;
    }
    return false;
  }

  private handleInputKeydown(evt: KeyboardEvent): void {
    if (this.handleSlashNavigation(evt)) {
      return;
    }
    if (this.handleMentionNavigation(evt)) {
      return;
    }
    if (evt.key === "Enter" && (evt.ctrlKey || evt.metaKey)) {
      evt.preventDefault();
      void this.handleSend();
      return;
    }
    if (evt.key === "Enter") {
      if (evt.shiftKey) {
        return;
      }
      evt.preventDefault();
      void this.handleSend();
    }
  }

  private selectSlashIndex(index: number): void {
    const suggestion = this.slashItems[index];
    if (!suggestion) return;
    const cursor = this.inputEl.selectionStart ?? this.inputEl.value.length;
    if (this.slashTriggerIndex < 0 || this.slashTriggerIndex > cursor) {
      this.hideSlashMenu();
      return;
    }
    const before = this.inputEl.value.slice(0, this.slashTriggerIndex);
    const after = this.inputEl.value.slice(cursor);
    const insertion = `/${suggestion.name}`;
    const needsSpace = after.length > 0 && !after.startsWith(" ");
    this.inputEl.value = `${before}${insertion}${needsSpace ? " " : ""}${after}`;
    const nextCursor = before.length + insertion.length + (needsSpace ? 1 : 0);
    this.inputEl.setSelectionRange(nextCursor, nextCursor);
    this.hideSlashMenu();
    this.inputEl.focus();
  }

  private checkSlashTrigger(): void {
    if (!this.inputEl) return;
    const cursor = this.inputEl.selectionStart ?? 0;
    if ((this.inputEl.selectionStart ?? 0) !== (this.inputEl.selectionEnd ?? 0)) {
      this.hideSlashMenu();
      return;
    }
    const before = this.inputEl.value.slice(0, cursor);
    const match = before.match(/(^|[\s])\/([\w-]*)$/);
    if (!match) {
      this.hideSlashMenu();
      return;
    }
    const slashIndex = before.lastIndexOf("/");
    this.slashTriggerIndex = slashIndex >= 0 ? slashIndex : -1;
    if (this.slashTriggerIndex < 0) {
      this.hideSlashMenu();
      return;
    }
    this.slashQuery = match[2] ?? "";
    const matches = this.getSlashMatches(this.slashQuery);
    if (matches.length === 0) {
      this.hideSlashMenu();
      return;
    }
    this.slashItems = matches;
    this.slashHighlightIndex = 0;
    this.renderSlashMenu();
    this.hideMentionMenu();
  }

  private getSlashMatches(query: string): SlashSuggestion[] {
    if (!query) {
      return this.slashCommandIndex.slice(0, 12);
    }
    const normalized = query.toLowerCase();
    return this.slashCommandIndex
      .filter((item) => item.name.toLowerCase().includes(normalized))
      .slice(0, 12);
  }

  private renderSlashMenu(): void {
    this.slashListEl.empty();
    this.slashItems.forEach((item, idx) => {
      const option = this.slashListEl.createDiv(
        "cli-ai-slash-item" + (idx === this.slashHighlightIndex ? " is-active" : ""),
      );
      option.createSpan({ cls: "cli-ai-slash-name", text: `/${item.name}` });
      if (item.description) {
        option.createSpan({ cls: "cli-ai-slash-desc", text: item.description });
      }
      if (item.source === "claude") {
        option.createSpan({ cls: "cli-ai-slash-source", text: "Claude" });
      }
      option.addEventListener("mousedown", (evt) => {
        evt.preventDefault();
        this.selectSlashIndex(idx);
      });
    });
    this.slashActive = true;
    this.slashMenuEl.classList.remove("hidden");
    this.scrollSlashHighlightIntoView();
  }

  private hideSlashMenu(): void {
    this.slashActive = false;
    this.slashItems = [];
    this.slashTriggerIndex = -1;
    this.slashMenuEl.classList.add("hidden");
    this.slashListEl.empty();
  }

  private scrollSlashHighlightIntoView(): void {
    const active = this.slashListEl.children.item(this.slashHighlightIndex) as HTMLElement | null;
    active?.scrollIntoView({ block: "nearest" });
  }

  private handleMentionNavigation(evt: KeyboardEvent): boolean {
    if (!this.mentionActive || this.mentionItems.length === 0) {
      return false;
    }
    if (evt.key === "ArrowDown") {
      evt.preventDefault();
      this.mentionHighlightIndex = (this.mentionHighlightIndex + 1) % this.mentionItems.length;
      this.renderMentionMenu();
      return true;
    }
    if (evt.key === "ArrowUp") {
      evt.preventDefault();
      this.mentionHighlightIndex =
        (this.mentionHighlightIndex - 1 + this.mentionItems.length) % this.mentionItems.length;
      this.renderMentionMenu();
      return true;
    }
    if (evt.key === "Enter") {
      evt.preventDefault();
      this.selectMentionIndex(this.mentionHighlightIndex);
      return true;
    }
    if (evt.key === "Escape") {
      evt.preventDefault();
      this.hideMentionMenu();
      return true;
    }
    return false;
  }

  private selectMentionIndex(index: number): void {
    const suggestion = this.mentionItems[index];
    if (!suggestion) return;
    const cursor = this.inputEl.selectionStart ?? this.inputEl.value.length;
    if (this.mentionTriggerIndex < 0 || this.mentionTriggerIndex > cursor) {
      this.hideMentionMenu();
      return;
    }
    const before = this.inputEl.value.slice(0, this.mentionTriggerIndex);
    const after = this.inputEl.value.slice(cursor);
    const insertion = `@${suggestion.path}`;
    this.inputEl.value = `${before}${insertion}${after}`;
    const nextCursor = before.length + insertion.length;
    this.inputEl.setSelectionRange(nextCursor, nextCursor);
    this.hideMentionMenu();
    this.inputEl.focus();
  }

  private checkMentionTrigger(): void {
    if (!this.inputEl) return;
    const cursor = this.inputEl.selectionStart ?? 0;
    if ((this.inputEl.selectionStart ?? 0) !== (this.inputEl.selectionEnd ?? 0)) {
      this.hideMentionMenu();
      return;
    }
    const before = this.inputEl.value.slice(0, cursor);
    const match = before.match(/(^|[\s([])@([\w\-/.]*)$/);
    if (!match) {
      this.hideMentionMenu();
      return;
    }
    this.mentionTriggerIndex = cursor - match[2].length - 1;
    if (this.mentionTriggerIndex < 0) {
      this.hideMentionMenu();
      return;
    }
    this.mentionQuery = match[2] ?? "";
    const matches = this.getMentionMatches(this.mentionQuery);
    if (matches.length === 0) {
      this.hideMentionMenu();
      return;
    }
    this.hideSlashMenu();
    this.mentionItems = matches;
    this.mentionHighlightIndex = 0;
    this.renderMentionMenu();
  }

  private getMentionMatches(query: string): MentionSuggestion[] {
    if (!query) {
      return this.fileIndex.slice(0, 20);
    }
    const normalized = query.toLowerCase();
    return this.fileIndex
      .filter((file) =>
        file.basename.toLowerCase().includes(normalized) || file.path.toLowerCase().includes(normalized),
      )
      .slice(0, 20);
  }

  private renderMentionMenu(): void {
    this.mentionListEl.empty();
    this.mentionItems.forEach((item, idx) => {
      const option = this.mentionListEl.createDiv(
        "cli-ai-mention-item" + (idx === this.mentionHighlightIndex ? " is-active" : ""),
      );
      option.createSpan({ cls: "cli-ai-mention-item-name", text: item.basename });
      option.createSpan({ cls: "cli-ai-mention-item-path", text: item.path });
      option.addEventListener("mousedown", (evt) => {
        evt.preventDefault();
        this.selectMentionIndex(idx);
      });
    });
    this.mentionActive = true;
    this.mentionMenuEl.classList.remove("hidden");
    this.scrollMentionHighlightIntoView();
  }

  private hideMentionMenu(): void {
    this.mentionActive = false;
    this.mentionItems = [];
    this.mentionTriggerIndex = -1;
    this.mentionMenuEl.classList.add("hidden");
    this.mentionListEl.empty();
  }

  private scrollMentionHighlightIntoView(): void {
    const active = this.mentionListEl.children.item(this.mentionHighlightIndex) as HTMLElement | null;
    active?.scrollIntoView({ block: "nearest" });
  }


  private insertMessage(msg: ChatMessage, index: number): void {
    this.messages.splice(index, 0, msg);
    const el = this.createMessageElement(msg);
    if (
      this.plugin.settings.compactToolCalls &&
      (msg.meta?.kind === "tool_call" || msg.meta?.kind === "tool_result")
    ) {
      el.classList.add("cli-ai-chat-tool-hidden");
    }
    const nodes = this.messagesEl.getElementsByClassName("cli-ai-chat-message");
    if (index >= nodes.length) {
      this.messagesEl.appendChild(el);
    } else {
      const ref = nodes.item(index);
      ref?.parentElement?.insertBefore(el, ref);
    }
    this.scrollToBottom();
    this.pruneMessageHistory();
  }


  private appendMessage(msg: ChatMessage): void {
    this.insertMessage(msg, this.messages.length);
  }

  private pruneMessageHistory(): void {
    if (this.messages.length <= MAX_RENDERED_MESSAGES) {
      return;
    }
    const removeCount = this.messages.length - MAX_RENDERED_MESSAGES;
    this.messages.splice(0, removeCount);
    const nodes = this.messagesEl.getElementsByClassName("cli-ai-chat-message");
    for (let i = 0; i < removeCount; i++) {
      nodes.item(0)?.remove();
    }
  }

  private findLastAssistantIndex(): number {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i];
      if (msg.role === "assistant" && msg.meta?.kind !== "context") {
        return i;
      }
    }
    return -1;
  }

  private createMessageElement(msg: ChatMessage): HTMLElement {
    const el = document.createElement("div");
    el.classList.add("cli-ai-chat-message", `cli-ai-chat-${msg.role}`);

    const meta = msg.meta as ToolMeta | PlanMeta | ContextMeta | undefined;
    const isTool = msg.role === "tool" || meta?.kind === "tool_call" || meta?.kind === "tool_result";

    if (isTool && meta && (meta.kind === "tool_call" || meta.kind === "tool_result")) {
      el.classList.add("cli-ai-chat-tool");
      const bubble = document.createElement("div");
      bubble.classList.add("cli-ai-chat-bubble", "cli-ai-chat-tool-bubble");

      const header = document.createElement("div");
      header.classList.add("cli-ai-chat-tool-header");

      const icon = document.createElement("span");
      icon.classList.add("cli-ai-chat-tool-icon");
      icon.textContent = this.iconForTool(meta.toolName);
      header.appendChild(icon);

      const label = document.createElement("span");
      label.classList.add("cli-ai-chat-tool-label");
      label.textContent = meta.kind === "tool_call" ? "Tool Call" : "Tool Result";
      header.appendChild(label);

      const title = document.createElement("span");
      title.classList.add("cli-ai-chat-tool-title", "cli-ai-chat-tool-name");
      title.textContent = meta.toolTitle ?? meta.toolName ?? "Tool";
      header.appendChild(title);

      if (meta.toolStatus) {
        const status = document.createElement("span");
        status.classList.add(
          "cli-ai-chat-tool-status",
          `cli-ai-chat-tool-status-${meta.toolStatus}`,
        );
        status.textContent = meta.toolStatus.toUpperCase();
        header.appendChild(status);
      }

      bubble.appendChild(header);

      if (meta.toolCommand || meta.toolPath) {
        const metaRow = document.createElement("div");
        metaRow.classList.add("cli-ai-chat-tool-meta");
        if (meta.toolCommand) {
          const cmd = document.createElement("code");
          cmd.textContent = meta.toolCommand;
          metaRow.appendChild(cmd);
        }
        if (meta.toolPath) {
          const path = document.createElement("span");
          path.classList.add("cli-ai-chat-tool-path");
          path.textContent = meta.toolPath;
          metaRow.appendChild(path);
        }
        bubble.appendChild(metaRow);
      }

      if (msg.text && msg.text.trim().length > 0) {
        const body = document.createElement("pre");
        body.classList.add("cli-ai-chat-tool-body");
        body.textContent = msg.text;
        bubble.appendChild(body);
      }

      el.appendChild(bubble);
      return el;
    }

    const bubble = document.createElement("div");
    bubble.classList.add("cli-ai-chat-bubble");
    this.renderMessageMarkdown(bubble, msg.text ?? "");
    el.appendChild(bubble);

    if (msg.meta?.kind === "context") {
      el.classList.add("cli-ai-chat-context");
    }
    if (msg.meta?.kind === "tool_summary") {
      el.classList.add("cli-ai-chat-tool-summary");
    }
    return el;
  }

  private renderMessageMarkdown(container: HTMLElement, text: string): void {
    container.empty();
    const content = (text ?? "").trim().length > 0 ? text : "";
    const sourcePath = this.app.workspace.getActiveFile()?.path ?? "";
    MarkdownRenderer.render(this.app, content, container, sourcePath, this).catch((err) => {
      console.error("Failed to render chat Markdown", err);
      container.setText(text ?? "");
    });
  }

  private updateLastAssistantMessage(text: string): void {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i];
      if (msg.role === "assistant" && msg.meta?.kind !== "context") {
        msg.text = text;
        const nodes = this.messagesEl.getElementsByClassName("cli-ai-chat-message");
        const node = nodes.item(i);
        if (node) {
          const bubble = node.querySelector<HTMLElement>(".cli-ai-chat-bubble");
          if (bubble) {
            this.renderMessageMarkdown(bubble, text);
          }
        }
        this.scrollToBottom();
        return;
      }
    }
  }


  private handleToolEvent(evt: ToolEventPayload): void {
    const kind = evt?.type;
    if (!kind) return;

    const block = evt?.block ?? {};
    const compact = this.plugin.settings.compactToolCalls;
    if (compact) {
      this.recordToolSummaryEvent(kind, block);
    }

    const now = Date.now();
    const toolId = block.id ?? block.tool_use_id ?? `tool-${now}`;
    const toolName = block.name ?? "Tool";

    if (kind === "tool_use") {
      const rawCmd = block.input?.command ?? block.input?.cmd;
      const rawPath = block.input?.file_path ?? block.input?.path;
      const cmd = typeof rawCmd === "string" ? rawCmd : undefined;
      const path = typeof rawPath === "string" ? rawPath : undefined;
      const title = block.display ?? block.title ?? block.name ?? (cmd ? `Run: ${cmd}` : undefined);
      const description = this.describeToolUse(block);
      const msg: ChatMessage = {
        id: `tool-${toolId}`,
        role: "tool",
        text: description,
        timestamp: now,
        meta: {
          kind: "tool_call",
          toolId,
          toolName,
          toolTitle: title,
          toolStatus: "running",
          toolCommand: cmd,
          toolPath: path,
        },
      };
      const insertIndex = this.findLastAssistantIndex();
      this.insertMessage(msg, insertIndex >= 0 ? insertIndex : this.messages.length);
      return;
    }

    if (kind === "tool_result") {
      const text = this.describeToolResult(block);
      const status: ToolStatus = block.is_error || block.error ? "error" : "done";
      const exitCode = typeof block.exit_code === "number" ? block.exit_code : undefined;
      const existingIndex = this.messages.findIndex(
        (m) => m.meta?.kind === "tool_call" && (m.meta as ToolMeta).toolId === toolId,
      );
      if (existingIndex >= 0) {
        this.updateToolMessage(existingIndex, text, status, exitCode);
      } else {
        const msg: ChatMessage = {
          id: `tool-result-${toolId}`,
          role: "tool",
          text,
          timestamp: now,
          meta: {
            kind: "tool_result",
            toolId,
            toolName,
            toolStatus: status,
            exitCode,
          },
        };
        const insertIndex = this.findLastAssistantIndex();
        this.insertMessage(msg, insertIndex >= 0 ? insertIndex : this.messages.length);
      }
    }
  }

  private updateToolMessage(index: number, text: string, status: ToolStatus, exitCode?: number): void {
    const msg = this.messages[index];
    msg.text = text;
    const meta = msg.meta as ToolMeta | undefined;
    if (meta && (meta.kind === "tool_call" || meta.kind === "tool_result")) {
      msg.meta = { ...meta, kind: "tool_result", toolStatus: status, exitCode } as ToolMeta;
    }
    const nodes = this.messagesEl.getElementsByClassName("cli-ai-chat-message");
    const node = nodes.item(index);
    if (node) {
      const bubble = node.querySelector<HTMLElement>(".cli-ai-chat-bubble");
      if (bubble) {
        const statusEl = bubble.querySelector<HTMLElement>(".cli-ai-chat-tool-status");
        if (statusEl && status) {
          statusEl.textContent = status.toUpperCase();
          statusEl.className = "cli-ai-chat-tool-status cli-ai-chat-tool-status-" + status;
        }
        const body = bubble.querySelector<HTMLElement>(".cli-ai-chat-tool-body");
        if (body) {
          body.textContent = text;
        }
      }
    }
    this.scrollToBottom();
  }

  private recordToolSummaryEvent(kind: string, block: Partial<ContentBlock>): void {
    if (kind !== "tool_use" && kind !== "tool_result") return;
    const summary = this.ensureToolSummaryState();
    if (kind === "tool_use") {
      const toolName = block?.name ?? "Tool";
      const toolId = block?.id ?? block?.tool_use_id ?? `tool-${Date.now()}`;
      if (!summary.seenToolIds.has(toolId)) {
        summary.seenToolIds.add(toolId);
        summary.totalCalls += 1;
        summary.toolCounts[toolName] = (summary.toolCounts[toolName] ?? 0) + 1;
      }
    } else if (kind === "tool_result") {
      if (block?.is_error || block?.error) {
        summary.errorCount += 1;
      }
    }
    this.updateToolSummaryMessage();
  }

  private ensureToolSummaryState(): ToolSummaryState {
    if (this.toolSummary && this.toolSummaryMessageId) {
      return this.toolSummary;
    }
    const id = `tool-summary-${Date.now()}`;
    this.toolSummary = {
      id,
      totalCalls: 0,
      toolCounts: {},
      errorCount: 0,
      seenToolIds: new Set<string>(),
    };
    this.toolSummaryMessageId = id;
    const msg: ChatMessage = {
      id,
      role: "tool",
      text: this.formatToolSummaryText(this.toolSummary),
      timestamp: Date.now(),
      meta: { kind: "tool_summary" },
    };
    const insertIndex = this.findLastAssistantIndex();
    this.insertMessage(msg, insertIndex >= 0 ? insertIndex + 1 : this.messages.length);
    return this.toolSummary;
  }

  private updateToolSummaryMessage(): void {
    if (!this.toolSummary || !this.toolSummaryMessageId) return;
    const index = this.messages.findIndex((m) => m.id === this.toolSummaryMessageId);
    if (index < 0) return;
    const text = this.formatToolSummaryText(this.toolSummary);
    this.messages[index].text = text;
    const nodes = this.messagesEl.getElementsByClassName("cli-ai-chat-message");
    const node = nodes.item(index);
    if (node) {
      const bubble = node.querySelector<HTMLElement>(".cli-ai-chat-bubble");
      if (bubble) {
        this.renderMessageMarkdown(bubble, text);
      }
    }
  }

  private formatToolSummaryText(summary: ToolSummaryState): string {
    const breakdownEntries = Object.entries(summary.toolCounts).sort((a, b) => b[1] - a[1]);
    const breakdown = breakdownEntries.map(([name, count]) => `${name} ×${count}`).join(", ");
    const parts: string[] = [`**Tool calls:** ${summary.totalCalls}`];
    if (breakdown.length > 0) {
      parts.push(breakdown);
    }
    if (summary.errorCount > 0) {
      parts.push(`**Errors:** ${summary.errorCount}`);
    }
    return parts.join(" • ");
  }

  private clearToolSummaryMessage(): void {
    if (this.toolSummaryMessageId) {
      const idx = this.messages.findIndex((m) => m.id === this.toolSummaryMessageId);
      if (idx >= 0) {
        this.removeMessageAtIndex(idx);
      }
    }
    this.toolSummary = null;
    this.toolSummaryMessageId = null;
  }

  private removeMessageAtIndex(index: number): void {
    this.messages.splice(index, 1);
    const nodes = this.messagesEl.getElementsByClassName("cli-ai-chat-message");
    const node = nodes.item(index);
    if (node?.parentElement) {
      node.parentElement.removeChild(node);
    }
  }

  private migrateExistingToolMessagesToSummary(): void {
    const toolEntries = this.messages
      .map((msg, index) => ({ msg, index }))
      .filter(({ msg }) => msg.meta?.kind === "tool_call" || msg.meta?.kind === "tool_result");

    this.clearToolSummaryMessage();
    if (toolEntries.length === 0) {
      return;
    }

    const summary = this.ensureToolSummaryState();
    summary.totalCalls = 0;
    summary.toolCounts = {};
    summary.errorCount = 0;
    summary.seenToolIds = new Set<string>();

    toolEntries.forEach(({ msg }) => {
      const meta = msg.meta as ToolMeta | undefined;
      const toolId = meta?.toolId ?? msg.id;
      const toolName = meta?.toolName ?? "Tool";
      if (!summary.seenToolIds.has(toolId)) {
        summary.seenToolIds.add(toolId);
        summary.totalCalls += 1;
        summary.toolCounts[toolName] = (summary.toolCounts[toolName] ?? 0) + 1;
      }
      if (meta?.toolStatus === "error" || (typeof meta?.exitCode === "number" && meta.exitCode !== 0)) {
        summary.errorCount += 1;
      }
    });

    this.updateToolSummaryMessage();
  }

  private describeToolUse(block: Partial<ContentBlock>): string {
    if (!block) return "Tool call";
    const input = block.input as Record<string, unknown> | string | undefined;
    if (typeof input === "string") return input;
    const cmd = (input as Record<string, unknown>)?.command ?? (input as Record<string, unknown>)?.cmd;
    if (cmd && typeof cmd === "string") return cmd;
    const file = (input as Record<string, unknown>)?.file_path ?? (input as Record<string, unknown>)?.path;
    if (file && typeof file === "string") return file;
    return "Tool call";
  }

  private describeToolResult(block: Partial<ContentBlock>): string {
    const out: unknown = block?.output ?? block?.result ?? block?.text ?? block;
    if (typeof out === "string") return out;
    if (Array.isArray(out)) {
      return out
        .map((item: unknown) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object" && "text" in item && typeof (item as { text: unknown }).text === "string") {
            return (item as { text: string }).text;
          }
          return JSON.stringify(item);
        })
        .join("\n");
    }
    if (out && typeof out === "object") {
      if ("text" in out && typeof (out as { text: unknown }).text === "string") {
        return (out as { text: string }).text;
      }
      if ("stdout" in out && typeof (out as { stdout: unknown }).stdout === "string") {
        return (out as { stdout: string }).stdout;
      }
    }
    return JSON.stringify(out);
  }

  private iconForTool(name?: string): string {
    if (!name) return "🛠";
    if (name === "Bash") return "⌘";
    if (name === "Read") return "📖";
    if (name === "Write" || name === "Edit") return "📝";
    if (typeof name === "string" && name.startsWith("mcp__")) return "🔌";
    return "🛠";
  }

  private setUiBusy(busy: boolean): void {
    this.isStreaming = busy;
    if (this.sendButtonEl) {
      setIcon(this.sendButtonEl, busy ? "x-circle" : "send");
      this.sendButtonEl.setAttribute("aria-label", busy ? "Cancel response" : "Send message");
      this.sendButtonEl.classList.toggle("is-cancel", busy);
      this.sendButtonEl.disabled = false;
    }
    this.inputEl.disabled = busy;
    this.loadingEl.classList.toggle("hidden", !busy);
    if (this.loadingTextEl) {
      this.loadingTextEl.textContent = busy ? "Claude is thinking..." : "";
    }
  }

  private scrollToBottom(): void {
    if (!this.shouldAutoScroll) return;
    if (!this.messagesWrapperEl) return;
    this.messagesWrapperEl.scrollTop = this.messagesWrapperEl.scrollHeight;
  }

  private updateAutoScrollFlag(): void {
    this.shouldAutoScroll = this.isNearBottom();
  }

  private isNearBottom(): boolean {
    if (!this.messagesWrapperEl) return true;
    const { scrollTop, scrollHeight, clientHeight } = this.messagesWrapperEl;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    return distanceFromBottom < 48;
  }

  private async handleSend(): Promise<void> {
    if (this.isStreaming) return;
    this.hideMentionMenu();
    this.hideSlashMenu();
    this.clearToolSummaryMessage();

    const raw = this.inputEl.value.trim();

    if (!raw) {
      if (this.messages.length === 0) {
        this.renderEmptyState();
      }
      return;
    }

    // Handle slash commands locally
    if (this.tryHandleSlashCommand(raw)) {
      this.inputEl.value = "";
      if (this.messages.length === 0) {
        this.renderEmptyState();
      }
      return;
    }

    if (this.plugin.settings.confirmBeforeRun) {
      const modal = new ConfirmModal(this.app, "Run this command with the configured CLI?");
      const ok = await modal.waitForResult();
      if (!ok) {
        if (this.messages.length === 0) {
          this.renderEmptyState();
        }
        return;
      }
    }

    if (this.messages.length === 0) {
      this.messagesEl.empty();
    }

    const contextText = this.buildContextBlock();
    const userPrompt = contextText ? `${contextText}\n\n${raw}` : raw;
    const prompt = this.buildPrompt(userPrompt);

    const userMsg: ChatMessage = {
      id: `m-${Date.now()}-user`,
      role: "user",
      text: raw,
      timestamp: Date.now(),
    };
    this.appendMessage(userMsg);
    this.inputEl.value = "";

    if (contextText) {
      const contextMsg: ChatMessage = {
        id: `m-${Date.now()}-context`,
        role: "assistant",
        text: contextText,
        timestamp: Date.now(),
        meta: { kind: "context" },
      };
      this.appendMessage(contextMsg);
    }

    this.setUiBusy(true);

    try {
      let assistantStarted = false;
      this.currentProcess = this.plugin.runCliCompletion(
        prompt,
        (_chunk: string, fullText: string) => {
          if (!assistantStarted) {
            const assistantMsg: ChatMessage = {
              id: `m-${Date.now()}-assistant`,
              role: "assistant",
              text: fullText || "",
              timestamp: Date.now(),
            };
            this.appendMessage(assistantMsg);
            assistantStarted = true;
          }
          this.updateLastAssistantMessage(fullText);
        },
        (errText: string) => {
          const errorMsg: ChatMessage = {
            id: `m-${Date.now()}-error`,
            role: "error",
            text: errText,
            timestamp: Date.now(),
          };
          this.appendMessage(errorMsg);
        },
        () => {
          this.setUiBusy(false);
          this.currentProcess = null;
        },
        (toolEvt: ToolEventPayload) => this.handleToolEvent(toolEvt),
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("CLI AI Chat error:", e);
      const errorMsg: ChatMessage = {
        id: `m-${Date.now()}-error`,
        role: "error",
        text: `Failed to start CLI: ${message}`,
        timestamp: Date.now(),
      };
      this.appendMessage(errorMsg);
      this.setUiBusy(false);
      this.currentProcess = null;
    }
  }

  private tryHandleSlashCommand(raw: string): boolean {
    if (!raw.startsWith("/")) return false;
    const parts = raw.slice(1).trim().split(/\s+/);
    const command = parts[0]?.toLowerCase() ?? "";
    const arg = parts[1]?.toLowerCase() ?? "";

    switch (command) {
      case "help": {
        const claudeCommands = this.slashCommandIndex
          .filter((item) => item.source === "claude")
          .map((item) => `/${item.name}`)
          .join(", ");
        const claudePart =
          claudeCommands.length > 0 ? ` Claude commands: ${claudeCommands}.` : " No Claude commands detected yet.";
        new Notice(
          "Commands: /context on|off|toggle, /export, /clear, /mention, /help, /createskill, /createcommand." +
            claudePart,
        );
        return true;
      }
      case "context": {
        let next = this.plugin.settings.includeFileContext;
        if (arg === "on") next = true;
        else if (arg === "off") next = false;
        else next = !next;
        void this.plugin.settingsStore.update({ includeFileContext: next }).then(() => {
          this.refreshContextToggle();
        });
        new Notice(`Context ${next ? "enabled" : "disabled"}.`);
        return true;
      }
      case "export": {
        if (this.messages.length === 0) {
          new Notice("Nothing to export yet.");
          return true;
        }
        void this.plugin.exportConversation(this.messages).then((path: string) => {
          new Notice(`Chat exported to ${path}`);
        });
        return true;
      }
      case "clear": {
        this.clearMessages();
        new Notice("Chat cleared.");
        return true;
      }
      case "mention": {
        this.insertMention();
        return true;
      }
      case "createskill":
      case "createcommand": {
        void this.plugin.ensureClaudeStarterAssets();
        new Notice(
          `${command === "createskill" ? "Skill" : "Command"} starter files ensured. Claude will guide you through creation.`,
        );
        return false;
      }
      default:
        // Allow custom Claude commands (from .claude/commands) to flow through to the CLI
        if (this.slashCommandIndex.some((item) => item.name.toLowerCase() === command && item.source === "claude")) {
          return false;
        }
        new Notice(`Unknown command: /${command}`);
        return true;
    }
  }

  private insertMention(): void {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice("No active note to mention.");
      return;
    }
    const mention = `@${activeFile.path}`;
    const existing = this.inputEl.value;
    const insertion = existing.length > 0 ? `${existing} ${mention}` : mention;
    this.inputEl.value = insertion;
    this.inputEl.focus();
    this.inputEl.setSelectionRange(this.inputEl.value.length, this.inputEl.value.length);
  }

  private clearMessages(): void {
    this.messages = [];
    this.messagesEl.empty();
    this.renderEmptyState();
  }

  private buildContextBlock(): string {
    if (!this.plugin.settings.includeFileContext) return "";

    const activeFile = this.app.workspace.getActiveFile();
    const vaultPath = this.app.vault.adapter instanceof FileSystemAdapter
      ? this.app.vault.adapter.getBasePath()
      : "";
    const filePath = activeFile ? `${vaultPath}/${activeFile.path}` : undefined;

    let selectionText = "";
    if (this.plugin.settings.includeSelection) {
      const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
      const text = mdView?.editor?.getSelection() ?? "";
      if (text.trim().length > 0) {
        selectionText = text.slice(0, this.plugin.settings.selectionCharLimit);
      }
    }

    const parts: string[] = [];
    if (filePath) {
      parts.push(`Current file: ${filePath}`);
    }
    if (selectionText) {
      parts.push("Selected text:");
      parts.push(selectionText);
    }
    return parts.join("\n");
  }

  private buildPrompt(latestUserInput: string): string {
    return buildChatPrompt(
      this.messages,
      latestUserInput,
      this.plugin.settings.maxHistoryMessages,
    );
  }

  private stopStreaming(): void {
    if (!this.currentProcess) return;
    try {
      this.currentProcess.kill("SIGINT");
    } catch (e) {
      console.error("Failed to stop CLI process:", e);
    }
    this.currentProcess = null;
    this.setUiBusy(false);
  }

  private renderEmptyState(): void {
    if (this.messages.length > 0) return;
    this.messagesEl.empty();

    const container = this.messagesEl.createDiv("cli-ai-welcome-container");
    container.createEl("h2", { text: "CLI AI Chat", cls: "cli-ai-welcome-title" });
    container.createEl("p", {
      text: "Your AI coding assistant, right inside Obsidian.",
      cls: "cli-ai-welcome-subtitle",
    });

    const cards = container.createDiv("cli-ai-welcome-cards");

    // Card 1: Initialize
    const initCard = cards.createDiv("cli-ai-welcome-card");
    initCard.createDiv("cli-ai-card-icon").setText("🚀");
    initCard.createEl("h3", { text: "Initialize workspace" });
    initCard.createEl("p", { text: "Create standard skills and commands." });
    initCard.addEventListener("click", () => {
      void this.plugin.ensureClaudeStarterAssets(true).then(() => {
        this.messagesEl.empty();
        this.appendMessage({
          id: `system-${Date.now()}`,
          role: "assistant",
          text: "Workspace initialized! I've added standard commands and skills to your vault. Type `/` to see them.",
          timestamp: Date.now(),
        });
      });
    });

    // Card 2: Context
    const contextCard = cards.createDiv("cli-ai-welcome-card");
    contextCard.createDiv("cli-ai-card-icon").setText("📝");
    contextCard.createEl("h3", { text: "Summarize note" });
    contextCard.createEl("p", { text: "Use current file as context." });
    contextCard.addEventListener("click", () => {
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        new Notice("No active note.");
        return;
      }
      void this.plugin.settingsStore.update({ includeFileContext: true }).then(() => {
        this.refreshContextToggle();
        this.inputEl.value = "Summarize this note.";
        void this.handleSend();
      });
    });

    // Card 3: Create Skill
    const skillCard = cards.createDiv("cli-ai-welcome-card");
    skillCard.createDiv("cli-ai-card-icon").setText("🛠️");
    skillCard.createEl("h3", { text: "Create skill" });
    skillCard.createEl("p", { text: "Teach Claude new tricks." });
    skillCard.addEventListener("click", () => {
      this.inputEl.value = "/createskill ";
      this.inputEl.focus();
    });
  }
}
