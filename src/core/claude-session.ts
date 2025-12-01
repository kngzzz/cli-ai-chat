import type { ChildProcessWithoutNullStreams } from "child_process";

import type { ClaudeSpawnConfig } from "../types";

// Using CommonJS require to avoid bundler complaints at runtime
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const require: any;
const { spawn } = require("child_process");

export type ClaudeLogFn = (...args: unknown[]) => void;

export class ClaudeStreamSession {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private listeners = new Map<
    (event: any) => void,
    { onDone: () => void; onError: (msg: string) => void }
  >();

  constructor(
    private spawnFactory: () => ClaudeSpawnConfig,
    private logDebug: ClaudeLogFn,
  ) {}

  dispose(): void {
    if (this.proc) {
      try {
        this.proc.kill();
      } catch (e) {
        this.logDebug("Failed to kill Claude stream process", e);
      }
      this.proc = null;
    }
    this.listeners.clear();
  }

  send(
    prompt: string,
    onChunk: (chunk: string, fullText: string) => void,
    onError: (errText: string) => void,
    onDone: () => void,
    onToolEvent?: (evt: any) => void,
  ): void {
    try {
      this.ensureProcess();
    } catch (e: any) {
      onError(`Failed to start Claude process: ${e?.message ?? String(e)}`);
      onDone();
      return;
    }
    if (!this.proc) {
      onError("Claude process is not available.");
      onDone();
      return;
    }

    let fullText = "";
    const cleanup = (): void => {
      if (this.listeners.has(handler)) {
        this.listeners.delete(handler);
      }
    };
    const handler = (evt: any) => {
      if (evt?.type === "assistant" && Array.isArray(evt.message?.content)) {
        for (const block of evt.message.content as any[]) {
          if (block.type === "text" && block.text) {
            fullText += block.text;
            onChunk(block.text, fullText);
          } else if (block.type === "tool_use" && onToolEvent) {
            onToolEvent({ type: "tool_use", block, raw: evt });
          } else if (block.type === "tool_result" && onToolEvent) {
            onToolEvent({ type: "tool_result", block, raw: evt });
          }
        }
      }

      if (evt?.type === "result") {
        onChunk("", fullText);
        cleanup();
        onDone();
      }
    };

    this.listeners.set(handler, { onDone, onError });

    const msg = {
      type: "user",
      message: {
        role: "user",
        content: [{ type: "text", text: prompt }],
      },
    };

    try {
      this.proc.stdin.write(JSON.stringify(msg) + "\n");
    } catch (e: any) {
      cleanup();
      onError(`Failed to write to Claude CLI: ${e?.message ?? String(e)}`);
      onDone();
    }
  }

  private ensureProcess(): void {
    if (!this.proc) {
      this.start();
    }
  }

  private start(): void {
    const { command, args, options } = this.spawnFactory();
    const proc = (this.proc = spawn(command, args, options ?? {}));

    proc.stdout.on("data", (chunk: Buffer) => this.consume(chunk.toString("utf8")));
    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      this.logDebug("[Claude stderr]", text);
    });
    proc.on("exit", (code: number | null) => {
      this.logDebug("Claude stream process exited", code);
      this.proc = null;
      this.failPending(`Claude process exited${typeof code === "number" ? ` with code ${code}` : ""}.`);
    });
    proc.on("error", (err: Error) => {
      this.logDebug("Claude stream process error", err);
      this.proc = null;
      this.failPending(`Claude process error: ${err.message}`);
    });
  }

  private consume(data: string): void {
    this.buffer += data;
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const evt = JSON.parse(line);
        this.listeners.forEach((_, fn) => fn(evt));
      } catch (e) {
        this.logDebug("Failed to parse Claude stream JSON", e, line);
        this.failPending("Claude emitted non-JSON output. Check Claude CLI flags.");
      }
    }
  }

  private failPending(message: string): void {
    if (this.listeners.size === 0) return;
    this.listeners.forEach((meta, handler) => {
      meta.onError(message);
      meta.onDone();
      this.listeners.delete(handler);
    });
  }
}
