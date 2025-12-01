
## CLI AI Chat Obsidian Plugin

This project is an Obsidian plugin that exposes a side‑pane chat interface for interacting with local OpenCode and Claude Code CLI tools.

### Features

- Right‑side view titled “CLI AI Chat”.
- Chat interface with streaming output (as stdout arrives from the CLI).
- Supports two providers:
  - OpenCode via the `opencode` CLI.
  - Claude via the `claude` CLI (Claude Code).
- Configurable binaries, extra arguments, and working directory.
- Conversation history (last N messages) is packed into the prompt for lightweight multi‑turn chats.

### Quick start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Build the plugin:

   ```bash
   npm run build
   ```

3. Copy or symlink the plugin folder into your Obsidian vault’s `.obsidian/plugins/cli-ai-chat` directory.

4. In Obsidian, enable **CLI AI Chat (OpenCode & Claude)** under **Settings → Community plugins**.

5. Ensure you have the CLIs installed and on your `PATH`:

   - OpenCode: `opencode`
   - Claude Code: `claude`

6. Open the chat view using the ribbon icon or the **Open CLI AI Chat** command.

### Configuration

In **Settings → CLI AI Chat**:

- **Default provider**: choose OpenCode or Claude.
- **Execution mode**:
  - `Native`: run `opencode` / `claude` directly on the host OS (requires the binaries to be installed where Obsidian runs).
  - `WSL`: on Windows, run the commands via `wsl`, using the vault (or custom) folder mapped to `/mnt/<drive>/...`.
- **WSL bash wrapper**: when enabled (default), calls `wsl --cd <vault> /bin/bash -lc "<cmd>"` so your shell profile (e.g., NVM) is loaded.
- **OpenCode binary / extra arguments**:
  - Default binary: `opencode`
  - Default extra args: `--format default`
  - The plugin calls `opencode run` and passes your message as the final argument, e.g. `opencode run --format default "<prompt>"`.
- **Claude binary / extra arguments**:
  - Default binary: `claude`
  - Default extra args: `--output-format=stream-json --input-format=stream-json --include-partial-messages --dangerously-skip-permissions`
  - The plugin runs the Claude CLI in streaming JSON mode and sends user messages over stdin.
- **Working directory**:
  - `Vault folder` (default): run CLIs with the Obsidian vault as `cwd`.
  - `Custom path`: set an absolute directory path.
- **Max history messages**:
  - Number of recent user/assistant messages that are included in the prompt.

### Notes on streaming

- The plugin listens to the CLI process `stdout` and updates the assistant message as text is received.
- Actual token‑by‑token streaming depends on the CLI:
  - If the CLI prints output incrementally, you’ll see it stream in Obsidian.
  - If the CLI prints only after completion, the message will appear all at once.
- For Claude, you can experiment with different `--output-format` options; for OpenCode, use flags like `-q` to reduce spinners and extra UI noise.
