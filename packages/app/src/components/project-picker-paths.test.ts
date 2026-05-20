import { describe, expect, it } from "vitest";
import {
  deriveInitialProjectBrowseDirectory,
  getParentProjectDirectory,
  getProjectDirectoryName,
  joinProjectDirectoryPath,
  normalizeProjectDirectoryPath,
  resolveProjectDirectoryInput,
} from "./project-picker-paths";

describe("project picker paths", () => {
  it("normalizes trailing separators without trimming roots", () => {
    expect(normalizeProjectDirectoryPath("/Users/test/project/")).toBe("/Users/test/project");
    expect(normalizeProjectDirectoryPath("/")).toBe("/");
    expect(normalizeProjectDirectoryPath("C:\\Users\\test\\project\\")).toBe(
      "C:\\Users\\test\\project",
    );
    expect(normalizeProjectDirectoryPath("C:\\")).toBe("C:\\");
  });

  it("gets parent directories for POSIX and Windows paths", () => {
    expect(getParentProjectDirectory("/Users/test/project")).toBe("/Users/test");
    expect(getParentProjectDirectory("/Users")).toBe("/");
    expect(getParentProjectDirectory("/")).toBeNull();
    expect(getParentProjectDirectory("C:\\Users\\test\\project")).toBe("C:\\Users\\test");
    expect(getParentProjectDirectory("C:\\Users")).toBe("C:\\");
    expect(getParentProjectDirectory("C:\\")).toBeNull();
  });

  it("joins child directories with the parent's separator style", () => {
    expect(joinProjectDirectoryPath("/Users/test", "project")).toBe("/Users/test/project");
    expect(joinProjectDirectoryPath("/", "Users")).toBe("/Users");
    expect(joinProjectDirectoryPath("C:\\Users\\test", "project")).toBe("C:\\Users\\test\\project");
  });

  it("uses the parent of the first recommended project as the initial browse directory", () => {
    expect(
      deriveInitialProjectBrowseDirectory({
        recommendedPaths: ["/Users/test/project"],
        fallbackDirectory: "/Users/test",
      }),
    ).toBe("/Users/test");
    expect(
      deriveInitialProjectBrowseDirectory({
        recommendedPaths: [],
        fallbackDirectory: "/Users/test",
      }),
    ).toBe("/Users/test");
  });

  it("gets a readable directory name", () => {
    expect(getProjectDirectoryName("/Users/test/project")).toBe("project");
    expect(getProjectDirectoryName("C:\\Users\\test\\project")).toBe("project");
    expect(getProjectDirectoryName("/")).toBe("/");
  });

  it("resolves explicit typed paths and ignores bare search terms", () => {
    expect(
      resolveProjectDirectoryInput({ value: "/Users/test/project", homeDirectory: null }),
    ).toBe("/Users/test/project");
    expect(resolveProjectDirectoryInput({ value: "~/project", homeDirectory: "/Users/test" })).toBe(
      "/Users/test/project",
    );
    expect(resolveProjectDirectoryInput({ value: "~", homeDirectory: "/Users/test" })).toBe(
      "/Users/test",
    );
    expect(
      resolveProjectDirectoryInput({ value: "C:\\Users\\test\\project", homeDirectory: null }),
    ).toBe("C:\\Users\\test\\project");
    expect(resolveProjectDirectoryInput({ value: "project", homeDirectory: "/Users/test" })).toBe(
      null,
    );
  });
});
