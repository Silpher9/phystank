import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const DUTCH_COPY_MARKERS = [
  "afgeketst",
  "dekking",
  "doorslag",
  "draaien",
  "effectief",
  "gereed",
  "granaat",
  "herladen",
  "inslaghoek",
  "laden",
  "nominaal",
  "pantser",
  "richten",
  "rijden",
  "schietbaan",
  "treffer",
  "uitkomst",
  "vernietigd",
  "vuren",
] as const;

describe("English project copy", () => {
  it("keeps project documentation and production UI strings in English", () => {
    const root = process.cwd();
    const files = [
      join(root, "README.md"),
      join(root, "index.html"),
      ...productionTypeScriptFiles(join(root, "src")),
    ];
    const markerPattern = new RegExp(DUTCH_COPY_MARKERS.join("|"), "giu");
    const violations = files.flatMap((file) => {
      const matches = [...readFileSync(file, "utf8").matchAll(markerPattern)];
      return matches.map(({ 0: marker }) => `${relative(root, file)}: ${marker}`);
    });

    expect(violations).toEqual([]);
  });
});

function productionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionTypeScriptFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}
