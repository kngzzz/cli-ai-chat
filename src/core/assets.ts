export const STARTER_COMMAND_FILES: { path: string; content: string }[] = [
  {
    path: ".claude/commands/createskill.md",
    content: `# Create Skill Command

You are helping the user create a Claude Code skill. Skills are automatically
invoked by you when the context matches.

Follow this conversation flow:

1. **Ask what the skill should do:**
   "What should this skill do? Be specific about the task."

2. **Ask when to invoke it:**
   "When should I use this skill? Describe the context or trigger."

3. **Ask for a name:**
   "What name should I give this skill? Use lowercase with hyphens."

4. **Generate SKILL.md file:**
   Create .claude/skills/{name}/SKILL.md with this structure:
   - YAML frontmatter with name and description
   - Detailed instructions for what to do
   - Examples if appropriate

5. **Confirm creation:**
   Show success message with file path and usage instructions.

Important: Validate name format (lowercase, hyphens only, no spaces).`,
  },
  {
    path: ".claude/commands/createcommand.md",
    content: `# Create Command

You are helping the user create a custom slash command. Commands are
invoked explicitly by the user typing /command-name.

Follow this conversation flow:

1. **Ask what the command should do:**
   "What should this command do when you invoke it?"

2. **Ask for a name:**
   "What name should this command have? Use lowercase with hyphens."

3. **Ask about arguments (optional):**
   "Should this command accept any arguments?"

4. **Generate command file:**
   Create .claude/commands/{name}.md with instructions

5. **Confirm creation:**
   Show success message with usage instructions.

Important: Validate name format (lowercase, hyphens only, no spaces).`,
  },
];

export const STARTER_SKILL_FILES: { path: string; content: string }[] = [
  {
    path: ".claude/skills/daily-note-formatter/SKILL.md",
    content: `---
name: daily-note-formatter
description: Format daily notes with consistent structure when user works on files in daily/ folder
---

# Daily Note Formatter

Automatically formats daily notes with consistent structure.

## When to Use
When user is editing a file in the daily/ folder (daily/YYYY-MM-DD.md pattern).

## What to Do
1. Ensure proper H1 heading with date
2. Check for standard sections (Today's Focus, Review Yesterday, etc.)
3. Extract tasks to appropriate sections
4. Add links to [[previous-day]] and [[next-day]]
5. Validate frontmatter has date and tags`,
  },
  {
    path: ".claude/skills/research-helper/SKILL.md",
    content: `---
name: research-helper
description: Help organize research notes and suggest connections when user works on research content
---

# Research Helper

Assists with organizing and connecting research notes.

## When to Use
When user is working on notes tagged with "research" or in research/ folder.

## What to Do
1. Analyze content structure and suggest improvements
2. Identify key findings and insights
3. Suggest related notes to link
4. Offer to create summary sections
5. Recommend organization improvements`,
  },
];
