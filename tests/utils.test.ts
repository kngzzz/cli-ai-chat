import { describe, expect, it } from "vitest";

import {
  sanitizeBinaryInput,
  sanitizeWorkingDirectoryInput,
  isAbsoluteOsPath,
  toWslPath,
} from "../src/utils";

describe("sanitizeBinaryInput", () => {
  it("allows safe names", () => {
    expect(sanitizeBinaryInput("claude")).toBe("claude");
    expect(sanitizeBinaryInput("cli-agent_1")).toBe("cli-agent_1");
  });

  it("rejects blank or invalid names", () => {
    expect(sanitizeBinaryInput(" ")).toBeNull();
    expect(sanitizeBinaryInput("bad name")).toBeNull();
  });
});

describe("sanitizeWorkingDirectoryInput", () => {
  it("accepts absolute paths and rejects unsafe ones", () => {
    const absolute = process.platform === "win32" ? "C:\\projects" : "/tmp/projects";
    expect(sanitizeWorkingDirectoryInput(absolute)).toBe(absolute);
    expect(sanitizeWorkingDirectoryInput("relative/path")).toBeNull();
    const unsafe = process.platform === "win32" ? "C:\\..\\secret" : "/tmp/../etc";
    expect(sanitizeWorkingDirectoryInput(unsafe)).toBeNull();
  });
});

describe("isAbsoluteOsPath", () => {
  it("detects absolute paths based on platform", () => {
    if (process.platform === "win32") {
      expect(isAbsoluteOsPath("C:\\foo")).toBe(true);
      expect(isAbsoluteOsPath("relative\\path")).toBe(false);
    } else {
      expect(isAbsoluteOsPath("/usr/bin")).toBe(true);
      expect(isAbsoluteOsPath("usr/bin")).toBe(false);
    }
  });
});

describe("toWslPath", () => {
  it("converts Windows style paths to WSL format", () => {
    expect(toWslPath("C:\\Users\\test")).toBe("/mnt/c/Users/test");
    expect(toWslPath("/already/linux")).toBe("/already/linux");
  });

});
