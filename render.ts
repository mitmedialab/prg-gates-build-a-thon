import type { FileInfo } from "./files.js";
import type { TemplateDef } from "./parse.js";

/** All variables available for substitution within a template body */
export interface TemplateVars extends FileInfo {
  /** Alias for `relative` — convenient for use in nested `data-src="{path}"` */
  path: string;
}

/**
 * Apply processing directives to a value string.
 *
 * Supported directives (applied left-to-right):
 *  - `YYYY-MM-DDTHH:mm:ss.SSSZ`  → ISO 8601 (value treated as Date)
 *  - `DD/MM/YY`                   → day/month/year
 *  - `strip`                      → trim whitespace
 *  - `"default text"`             → use as fallback if value is empty
 */
function applyDirective(value: string, directive: string): string {
  const trimmed = directive.trim();

  // Date formats (value must be a parseable date string or epoch number)
  if (trimmed === "YYYY-MM-DDTHH:mm:ss.SSSZ") {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString();
    return value;
  }

  if (trimmed === "DD/MM/YY") {
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      const dd = String(d.getUTCDate()).padStart(2, "0");
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const yy = String(d.getUTCFullYear()).slice(-2);
      return `${dd}/${mm}/${yy}`;
    }
    return value;
  }

  if (trimmed === "strip") {
    return value.trim();
  }

  // Default value directive: `"fallback text"`
  const defaultMatch = /^"(.*)"$/.exec(trimmed);
  if (defaultMatch) {
    return value.length > 0 ? value : defaultMatch[1];
  }

  return value;
}

/**
 * Resolve a variable name (and optional dot-path for `metadata.*`) to a
 * raw string value using the provided `TemplateVars`.
 */
function resolveVar(name: string, vars: TemplateVars): string {
  switch (name) {
    case "name":
      return vars.name;
    case "absolute":
      return vars.absolute;
    case "relative":
    case "path":
      return vars.relative;
    case "content":
      return vars.content;
    case "extension":
      return vars.extension;
    case "created":
      return vars.mtime.toISOString();
    case "modified":
      return vars.mtime.toISOString();
    case "accessed":
      return vars.atime.toISOString();
    case "query-index":
      return String(vars.queryIndex);
    case "processing-index":
      return String(vars.processingIndex);
  }

  // metadata.* access
  if (name.startsWith("metadata.")) {
    const key = name.slice("metadata.".length);
    const val = vars.metadata[key];
    return val !== undefined && val !== null ? String(val) : "";
  }

  return "";
}

/**
 * Substitute `{var}` / `{var|directive|...}` placeholders in `template`
 * using `vars`.
 *
 * The open/close delimiters and pipe character are configurable per
 * `TemplateDef`.
 */
export function substituteVars(
  template: string,
  vars: TemplateVars,
  def: Pick<TemplateDef, "open" | "close" | "pipe">,
): string {
  const { open, close, pipe } = def;

  // Escape special regex chars in delimiters
  const escapedOpen = escapeRegex(open);
  const escapedClose = escapeRegex(close);
  const escapedPipe = escapeRegex(pipe);

  // Match {varName} or {varName|directive|...}
  // Lazily match content between delimiters
  const varRe = new RegExp(
    `${escapedOpen}([^${escapedClose}]+?)${escapedClose}`,
    "g",
  );

  return template.replace(varRe, (_, inner: string) => {
    const parts = inner.split(new RegExp(escapedPipe));
    const varName = parts[0].trim();
    const directives = parts.slice(1);

    let value = resolveVar(varName, vars);
    for (const directive of directives) {
      value = applyDirective(value, directive);
    }
    return value;
  });
}

/**
 * Find the first matching template for a file from the ordered list of
 * template ids. A template matches if all specified match patterns
 * (name-match, path-match, content-match) pass.
 *
 * If a template has no match constraints it acts as a wildcard. Templates
 * are tested in order; the first match wins. If no template matches, returns
 * `undefined`.
 */
export function findMatchingTemplate(
  file: FileInfo,
  templateIds: string[],
  registry: Map<string, TemplateDef>,
): TemplateDef | undefined {
  for (const id of templateIds) {
    const tmpl = registry.get(id);
    if (!tmpl) continue;

    const { nameMatch, pathMatch, contentMatch, break: shouldBreak } = tmpl;

    const matches =
      (!nameMatch || nameMatch.test(file.name)) &&
      (!pathMatch || pathMatch.test(file.absolute)) &&
      (!contentMatch || contentMatch.test(file.rawContent));

    if (matches) {
      return tmpl;
    }

    if (shouldBreak) break;
  }
  return undefined;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
