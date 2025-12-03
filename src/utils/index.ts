import { App, FileSystemAdapter } from "obsidian";
import { BINARY_NAME_REGEX } from "../types";

export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex -- Required to match ANSI escape sequences
  return text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");
}

export function getVaultPath(app: App): string | null {
  const adapter = app.vault.adapter;
  if (adapter instanceof FileSystemAdapter) {
    return adapter.getBasePath();
  }
  return null;
}

export function toWslPath(winPath: string): string {
  if (!winPath) return winPath;
  const normalized = winPath.replace(/\//g, "\\");
  const match = normalized.match(/^([A-Za-z]):\\(.*)$/);
  if (match) {
    const drive = match[1].toLowerCase();
    const rest = match[2].replace(/\\/g, "/");
    return `/mnt/${drive}/${rest}`;
  }
  return winPath.replace(/\\/g, "/");
}

export function sanitizeBinaryInput(value: string): string | null {
  const trimmed = value?.trim?.() ?? "";
  if (trimmed.length === 0) {
    return null;
  }
  const fileName = trimmed.split(/[/\\]/).pop() ?? "";
  if (!BINARY_NAME_REGEX.test(fileName)) {
    return null;
  }
  return trimmed;
}

export function isAbsoluteOsPath(input: string): boolean {
  if (!input) return false;
  if (process.platform === "win32") {
    return /^[a-zA-Z]:[\\/]/.test(input) || input.startsWith("\\\\");
  }
  return input.startsWith("/");
}

export function sanitizeWorkingDirectoryInput(value: string): string | null {
  const trimmed = value?.trim?.() ?? "";
  if (trimmed.length === 0) {
    return null;
  }
  if (!isAbsoluteOsPath(trimmed)) {
    return null;
  }
  if (trimmed.split(/[\\/]+/).some((segment) => segment === "..")) {
    return null;
  }
  return trimmed;
}
