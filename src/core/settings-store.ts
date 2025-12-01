import type { ChatSettings } from "../types";

export interface SettingsHost {
  settings: ChatSettings;
  saveSettings(): Promise<void>;
  resetClaudeSession(): void;
}

export class SettingsStore {
  private listeners = new Set<() => void>();

  constructor(private host: SettingsHost) {}

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): ChatSettings => {
    return this.host.settings;
  };

  async update(partial: Partial<ChatSettings>): Promise<void> {
    this.host.settings = { ...this.host.settings, ...partial };
    await this.host.saveSettings();
    this.host.resetClaudeSession();
    this.listeners.forEach((fn) => fn());
  }
}
