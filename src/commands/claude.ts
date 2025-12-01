import { App } from "obsidian";
import * as fs from "fs";
import * as path from "path";

import type { SlashSuggestion } from "../types";

export function readClaudeCommandNamesFromDisk(basePath: string | null): string[] {
  if (!basePath) return [];
  const commandsDir = path.join(basePath, ".claude", "commands");
  try {
    const entries = fs.readdirSync(commandsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
      .map((entry) => entry.name.replace(/\.md$/i, ""));
  } catch {
    return [];
  }
}

export function readClaudeSkillNamesFromDisk(basePath: string | null): string[] {
  if (!basePath) return [];
  const skillsDir = path.join(basePath, ".claude", "skills");
  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    const skills: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(skillsDir, entry.name, "SKILL.md");
      if (fs.existsSync(skillFile)) {
        skills.push(entry.name);
      }
    }
    return skills;
  } catch {
    return [];
  }
}

export function collectClaudeCommandNames(app: App, workingDirectory: string | null): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  app.vault.getFiles().forEach((file) => {
    if (!file.path.startsWith(".claude/commands/")) return;
    if (file.extension !== "md") return;
    const key = file.basename.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    names.push(key);
  });

  readClaudeCommandNamesFromDisk(workingDirectory).forEach((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    names.push(key);
  });

  return names;
}

export function collectClaudeSkillNames(app: App, workingDirectory: string | null): string[] {
  const seen = new Set<string>();
  const skills: string[] = [];

  app.vault.getFiles().forEach((file) => {
    if (!file.path.startsWith(".claude/skills/")) return;
    if (file.name !== "SKILL.md") return;
    const skill = file.path.replace(".claude/skills/", "").replace(/\/SKILL\.md$/, "");
    if (!skill || seen.has(skill)) return;
    seen.add(skill);
    skills.push(skill);
  });

  readClaudeSkillNamesFromDisk(workingDirectory).forEach((skill) => {
    if (seen.has(skill)) return;
    seen.add(skill);
    skills.push(skill);
  });

  return skills;
}

export const BUILTIN_SLASH_COMMANDS: SlashSuggestion[] = [
  {
    name: "context",
    description: "Toggle file context on|off|toggle",
    source: "builtin",
  },
  {
    name: "export",
    description: "Export chat to Markdown",
    source: "builtin",
  },
  {
    name: "clear",
    description: "Clear conversation history",
    source: "builtin",
  },
  {
    name: "mention",
    description: "Insert active note mention",
    source: "builtin",
  },
  {
    name: "help",
    description: "Show available commands",
    source: "builtin",
  },
  {
    name: "createskill",
    description: "Guide to create a Claude Code skill",
    source: "builtin",
  },
  {
    name: "createcommand",
    description: "Guide to create a custom slash command",
    source: "builtin",
  },
];
