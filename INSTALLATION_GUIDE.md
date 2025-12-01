# CLI AI Chat Plugin - Easy Installation Guide

A step-by-step guide to get the CLI AI Chat plugin up and running in Obsidian.

## What is this plugin?

CLI AI Chat brings powerful AI coding assistants (OpenCode and Claude Code) directly into your Obsidian notes through an interactive side-panel. You can chat with AI, get code help, and maintain conversation context while taking notes.

---

## Quick Start (3 Steps)

### Step 1: Install Prerequisites

You need two things before installing the plugin:

#### A. Obsidian Desktop
- Download from [obsidian.md](https://obsidian.md)
- **Note**: Mobile is not supported (plugin requires CLI tools)

#### B. At Least One AI CLI Tool

Choose one or both:

**Option 1: OpenCode CLI**
```bash
# Install OpenCode
npm install -g opencode

# Verify installation
opencode --version
```

**Option 2: Claude Code CLI**
```bash
# Install Claude Code
npm install -g @anthropic-ai/claude-code

# Verify installation
claude --version
```

### Step 2: Install the Plugin

**Method A: Download Release (Easiest)**

1. Download the latest release from the repository
2. Extract the ZIP file
3. You should see these files:
   - `main.js`
   - `manifest.json`
   - `styles.css`

4. Copy these files to your vault:
   ```
   YourVault/.obsidian/plugins/cli-ai-chat/
   ```

   Example path:
   ```
   C:\Users\YourName\Documents\MyVault\.obsidian\plugins\cli-ai-chat\
   ```

**Method B: Build from Source**

1. Clone or download this repository:
   ```bash
   git clone https://github.com/yourusername/obsidian-cli-ai-chat.git
   cd obsidian-cli-ai-chat
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the plugin:
   ```bash
   npm run build
   ```

4. Copy to your vault:
   - Windows:
     ```bash
     xcopy /E /I . "C:\Users\YourName\Documents\YourVault\.obsidian\plugins\cli-ai-chat"
     ```
   - macOS/Linux:
     ```bash
     cp -r . ~/Documents/YourVault/.obsidian/plugins/cli-ai-chat/
     ```

### Step 3: Enable in Obsidian

1. Open Obsidian
2. Go to **Settings** (gear icon)
3. Click **Community plugins**
4. Turn off **Restricted mode** (if enabled)
5. Click **Browse** and find **CLI AI Chat (OpenCode & Claude)**
6. Click **Enable**

That's it! You should see a bot icon in the left sidebar.

---

## First-Time Setup

### Configure Your AI Provider

1. Open **Settings** → **CLI AI Chat**

2. Under **Provider Settings**, choose your default AI:
   - **OpenCode CLI** (faster, code-focused)
   - **Claude CLI** (advanced reasoning)
   - **Custom agent** (your own tool)

3. Enable **Auto-detect binaries** (recommended)
   - This automatically finds your CLI tools

4. If auto-detect doesn't work, enter the full path:
   ```
   Windows: C:\Users\YourName\AppData\Roaming\npm\opencode.cmd
   macOS:   /usr/local/bin/opencode
   Linux:   /usr/bin/opencode
   ```

### Test Your Installation

1. Click the **bot icon** in the left ribbon
2. The chat panel opens on the right
3. Type a simple question: `Hello, can you help me?`
4. Press **Send** or hit **Ctrl+Enter**
5. You should see a streaming response!

---

## Platform-Specific Instructions

### Windows Users

**Standard Installation:**
- CLI tools usually install to: `C:\Users\YourName\AppData\Roaming\npm\`
- Auto-detect should find them automatically

**Using WSL (Windows Subsystem for Linux):**

If your CLI tools are installed in WSL:

1. In plugin settings, set **Execution Mode** to **WSL**
2. Enable **WSL bash wrapper** to load your environment
3. The plugin will automatically convert Windows paths to WSL format

Example:
```
Windows path: C:\Users\YourName\Documents\Vault
WSL path:     /mnt/c/Users/YourName/Documents/Vault
```

### macOS Users

**Standard Installation:**
```bash
# Install via npm
npm install -g opencode
npm install -g @anthropic-ai/claude-code

# Verify installation
which opencode   # Should show: /usr/local/bin/opencode
which claude     # Should show: /usr/local/bin/claude
```

**Permissions:**
- Ensure CLI tools have execute permissions
- If needed: `chmod +x /usr/local/bin/opencode`

### Linux Users

**Standard Installation:**
```bash
# Install via npm
sudo npm install -g opencode
sudo npm install -g @anthropic-ai/claude-code

# Verify installation
which opencode   # Should show: /usr/bin/opencode
which claude     # Should show: /usr/bin/claude
```

---

## Common Installation Issues

### Issue 1: Plugin Doesn't Appear

**Check these:**
- [ ] Using Obsidian Desktop (not mobile)
- [ ] Files are in `.obsidian/plugins/cli-ai-chat/`
- [ ] Folder contains: `manifest.json`, `main.js`, `styles.css`
- [ ] Community plugins are enabled
- [ ] Restricted mode is OFF

**Solution:**
1. Close Obsidian completely
2. Verify files are in the correct location
3. Reopen Obsidian
4. Check Settings → Community plugins

### Issue 2: CLI Not Found

**Error:** `Command not found: opencode`

**Solution:**
1. Verify CLI is installed:
   ```bash
   opencode --version
   ```

2. If command not found, reinstall:
   ```bash
   npm install -g opencode
   ```

3. Find the full path:
   ```bash
   # Windows
   where opencode

   # macOS/Linux
   which opencode
   ```

4. In plugin settings, disable auto-detect and paste the full path

### Issue 3: No Streaming Output

**Symptoms:** Long wait, then entire response appears at once

**For OpenCode:**
- In settings, set **Extra arguments** to: `--format default`

**For Claude:**
- Plugin automatically uses stream format
- Ensure you have the latest Claude CLI version

### Issue 4: Timeout Errors

**Error:** `CLI timeout after 45000ms`

**Solution:**
1. Go to Settings → CLI AI Chat → Advanced
2. Increase **CLI timeout** to `120000` (2 minutes)
3. Complex tasks may need even longer

### Issue 5: WSL Errors (Windows)

**Error:** `WSL not found` or path conversion issues

**Solution:**
1. Verify WSL is installed:
   ```bash
   wsl --status
   ```

2. If not installed:
   ```bash
   wsl --install
   ```

3. In plugin settings:
   - Try disabling **WSL bash wrapper**
   - Or use **Native** execution mode instead

---

## Configuration Guide

### Essential Settings

#### 1. Provider Settings
- **Default Provider**: Choose OpenCode, Claude, or Custom
- **Auto-detect binaries**: Let plugin find CLI tools (recommended)

#### 2. Execution Settings
- **Working Directory**: Where CLI runs (usually your vault)
- **Execution Mode**: Native (default) or WSL (Windows only)

#### 3. Context Settings
- **Include file context**: Auto-add current note path (recommended: ON)
- **Include selection**: Send selected text (recommended: ON)
- **Selection character limit**: Max characters from selection (default: 800)

#### 4. Conversation Settings
- **Max history messages**: How many previous messages to include (default: 6)

### Advanced Settings

#### For Power Users
- **Confirm before run**: Prompt before executing (good for learning)
- **CLI timeout**: Max wait time in milliseconds
- **Export folder**: Where to save chat exports
- **Debug logging**: Enable for troubleshooting

---

## Next Steps

### Try These Features

1. **Basic Chat**
   - Click bot icon
   - Ask: "Explain what a linked list is"
   - Watch the streaming response

2. **Use Context**
   - Open a note
   - In chat, enable context (toggle button)
   - Ask: "Summarize this note"

3. **Send Selected Text**
   - Select text in your note
   - Enable "Include selection"
   - Ask: "Improve this paragraph"

4. **Tool Execution (Claude only)**
   - Ask: "Create a Python script to calculate fibonacci"
   - Watch Claude use tools like Write, Edit, Bash

5. **Export Chat**
   - Click Export button
   - Find exported Markdown in "AI Chat Exports" folder

### Slash Commands

Type these in the chat input:
```
/help      - Show all commands
/context   - Toggle file context
/export    - Export conversation
/clear     - Clear history
/mention   - Insert current note
```

---

## Getting Help

### Enable Debug Logging

1. Settings → CLI AI Chat → Advanced
2. Enable **Debug logging**
3. Open Developer Console: **Ctrl+Shift+I** (Windows/Linux) or **Cmd+Option+I** (macOS)
4. Check Console tab for error messages

### Check Your Setup

Run this checklist:
```bash
# 1. Check Obsidian version
# Settings → About → Version (should be 1.5.0+)

# 2. Check CLI tools
opencode --version
claude --version

# 3. Check Node.js
node --version    # Should be v18 or higher

# 4. Check plugin files
# Navigate to: YourVault/.obsidian/plugins/cli-ai-chat/
# Verify: manifest.json, main.js, styles.css exist
```

### Still Having Issues?

1. Review the [Troubleshooting section](README.md#troubleshooting) in README
2. Check the GitHub issues page
3. Open a new issue with:
   - Your OS and version
   - Obsidian version
   - CLI tool versions
   - Error messages from console
   - Screenshots if helpful

---

## Developer Quick Start

Want to modify or contribute?

1. **Clone and setup:**
   ```bash
   git clone https://github.com/yourusername/obsidian-cli-ai-chat.git
   cd obsidian-cli-ai-chat
   npm install
   ```

2. **Development mode** (auto-rebuild):
   ```bash
   npm run dev
   ```

3. **Create symlink** to your test vault:
   ```bash
   # Windows (as Administrator)
   mklink /D "C:\path\to\vault\.obsidian\plugins\cli-ai-chat" "C:\path\to\repo"

   # macOS/Linux
   ln -s /path/to/repo /path/to/vault/.obsidian/plugins/cli-ai-chat
   ```

4. **Reload plugin** in Obsidian after changes:
   - Ctrl+P → "Reload app without saving"

---

## Summary

### Minimum Requirements
- ✅ Obsidian Desktop (1.5.0+)
- ✅ Node.js (v18+)
- ✅ OpenCode CLI or Claude CLI
- ✅ 3 files in `.obsidian/plugins/cli-ai-chat/`

### Installation Steps
1. Install prerequisites
2. Copy plugin files to vault
3. Enable in Obsidian settings

### First Test
1. Click bot icon
2. Type a question
3. See streaming response

That's it! You're ready to use AI assistants in your Obsidian workflow.

---

**Need more details?** See the [full README](README.md) for complete documentation.
