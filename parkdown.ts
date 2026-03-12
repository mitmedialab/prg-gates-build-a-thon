import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseDocument, type TemplateDef } from "./parse.js";
import { resolveFiles, type ResolveOptions } from "./files.js";
import {
  substituteVars,
  findMatchingTemplate,
  type TemplateVars,
} from "./render.js";

export interface ParkdownOptions {
  /** Output mode: `"raw"` preserves parkdown HTML tags with content injected;
   *  `"clean"` strips all parkdown tags and outputs only the rendered content.
   *  @default "raw"
   */
  mode?: "raw" | "clean";
}

/**
 * Process a parkdown markdown file, expanding all `data-src` target blocks
 * using the `<template>` definitions found in the same file.
 *
 * @param filePath  Absolute or relative path to the `.md` file to process
 * @param options   Output mode options
 * @returns         Processed markdown string
 */
export async function parkdown(
  filePath: string,
  options: ParkdownOptions = {},
): Promise<string> {
  const { mode = "raw" } = options;

  const absPath = resolve(filePath);
  const source = await readFile(absPath, "utf-8");
  const baseDir = dirname(absPath);

  return processDocument(source, baseDir, mode);
}

/**
 * Internal document processor.
 * Exported for use in recursive rendering of nested targets.
 *
 * @param parentRegistry  Registry from the parent call — templates defined there
 *                        are available in nested `data-src` expansions.
 */
export async function processDocument(
  source: string,
  baseDir: string,
  mode: "raw" | "clean",
  parentRegistry?: Map<string, TemplateDef>,
): Promise<string> {
  const { templates, targets } = parseDocument(source);

  // Build template registry, inheriting parent templates so nested targets can
  // reference templates defined in the top-level document.
  const registry = new Map<string, TemplateDef>(parentRegistry ?? []);
  for (const tmpl of templates) {
    if (tmpl.id) registry.set(tmpl.id, tmpl);
  }

  // Process targets from last to first so string replacements don't offset earlier positions
  const replacements: Array<{
    start: number;
    end: number;
    replacement: string;
  }> = [];

  for (const target of [...targets].reverse()) {
    const { attrs, start, end } = target;

    const src = typeof attrs["src"] === "string" ? attrs["src"] : "";
    if (!src) continue;

    // Parse template ids from data-template (delimiter defaults to ",")
    const tmplDelimiter =
      typeof attrs["template-delimiter"] === "string"
        ? attrs["template-delimiter"]
        : ",";
    const templateAttr =
      typeof attrs["template"] === "string" ? attrs["template"] : "";
    const templateIds = templateAttr
      ? templateAttr
          .split(tmplDelimiter)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    // Resolve the data-join separator (unescape \n, \t, etc.)
    const joinRaw = typeof attrs["join"] === "string" ? attrs["join"] : "\\n";
    const join = unescapeString(joinRaw);

    // Build resolve options
    const resolveOpts: ResolveOptions = {
      sort: typeof attrs["sort"] === "string" ? attrs["sort"] : "path",
      order:
        attrs["order"] === "desc" || attrs["order"] === "asc"
          ? attrs["order"]
          : "asc",
      processing:
        typeof attrs["processing"] === "string" ? attrs["processing"] : "fifo",
    };
    if (typeof attrs["limit"] === "string") {
      const n = parseInt(attrs["limit"], 10);
      if (!isNaN(n)) resolveOpts.limit = n;
    }
    if (typeof attrs["offset"] === "string") {
      const n = parseInt(attrs["offset"], 10);
      if (!isNaN(n)) resolveOpts.offset = n;
    }
    if (typeof attrs["name-match"] === "string") {
      resolveOpts.nameMatch = attrs["name-match"];
    }
    if (typeof attrs["path-match"] === "string") {
      resolveOpts.pathMatch = attrs["path-match"];
    }
    if (typeof attrs["content-match"] === "string") {
      resolveOpts.contentMatch = attrs["content-match"];
    }

    // Resolve files
    const files = await resolveFiles(src, baseDir, resolveOpts);

    // Render each file through its matching template
    const renderedParts: string[] = [];
    for (const file of files) {
      const tmpl =
        templateIds.length > 0
          ? findMatchingTemplate(file, templateIds, registry)
          : undefined;

      let rendered: string;
      if (tmpl) {
        const vars: TemplateVars = { ...file, path: file.relative };
        // First substitute variables in the template body
        const substituted = substituteVars(tmpl.body, vars, tmpl);
        // Then recursively process any nested data-src elements in the result,
        // passing the current registry so nested spans can find parent templates.
        rendered = await processDocument(substituted, baseDir, mode, registry);
        // In raw mode, trim leading/trailing whitespace added by template newlines
        rendered = rendered.trim();
      } else {
        // No template — use raw file content
        rendered = file.content.trim();
      }

      renderedParts.push(rendered);
    }

    const joined = renderedParts.join(join);

    let replacement: string;
    if (mode === "raw") {
      // Inject content between the opening and closing tags
      const openTag = target.openTag.endsWith("/>")
        ? target.openTag.slice(0, -2) + ">"
        : target.openTag;
      replacement = openTag + "\n\n" + joined + "\n\n" + `</${target.tag}>`;
    } else {
      // Clean mode — just the rendered content
      replacement = joined;
    }

    replacements.push({ start, end, replacement });
  }

  // Apply replacements (already in reverse order)
  let result = source;
  for (const { start, end, replacement } of replacements) {
    result = result.slice(0, start) + replacement + result.slice(end);
  }

  // Clean mode: strip all <template> elements
  if (mode === "clean") {
    result = stripTemplateElements(result);
  }

  return result;
}

/**
 * Remove all `<template ...>...</template>` elements from a string.
 * Leaves surrounding text (including blank lines) intact; then collapses
 * runs of 3+ newlines to 2 to avoid excessive whitespace.
 */
function stripTemplateElements(source: string): string {
  // Remove <template> blocks — using the same non-greedy pattern
  let result = source.replace(
    /<template(\s[^>]*)?>[\s\S]*?<\/template>\s*/gs,
    "",
  );
  // Collapse excessive blank lines
  result = result.replace(/\n{3,}/g, "\n\n");
  return result;
}

/**
 * Unescape common escape sequences in a string value
 * (typically from an HTML attribute).
 */
function unescapeString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r")
    .replace(/\\\\/g, "\\");
}

// Re-export type for consumers
export type { TemplateDef };
