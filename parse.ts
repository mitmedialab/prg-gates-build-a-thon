import { Parser } from "htmlparser2";

/** Parsed attribute bag from an HTML opening tag */
export type Attrs = Record<string, string | true>;

/** A registered template definition */
export interface TemplateDef {
  id: string;
  body: string;
  attrs: Attrs;
  /** Compiled name-match regex, if provided */
  nameMatch?: RegExp;
  /** Compiled path-match regex, if provided */
  pathMatch?: RegExp;
  /** Compiled content-match regex, if provided */
  contentMatch?: RegExp;
  /** Opening delimiter for variable substitution */
  open: string;
  /** Closing delimiter for variable substitution */
  close: string;
  /** Pipe character for processing directives */
  pipe: string;
  /** Whether to halt further template matching after this template */
  break: boolean;
}

/** A target block found in a document */
export interface TargetBlock {
  /** HTML tag name */
  tag: string;
  /** Full text of the opening tag (e.g. `<div data-src="...">`) */
  openTag: string;
  /** Full text of the closing tag (e.g. `</div>`) */
  closeTag: string;
  /** Existing inner content (may be populated from a previous run) */
  existingContent: string;
  /** The entire matched text including tags and existing content */
  fullMatch: string;
  /** Character offset (start) in source */
  start: number;
  /** Character offset (end, exclusive) in source */
  end: number;
  /** Parsed attribute values */
  attrs: Attrs;
}

/** Result of parsing a document */
export interface ParseResult {
  templates: TemplateDef[];
  targets: TargetBlock[];
}

/**
 * Parse all `key="value"`, `key='value'`, or boolean `key` attributes
 * from an HTML opening tag string (the part between `<tagname` and `>`).
 *
 * Kept for API compatibility. Internal parsing now uses htmlparser2.
 */
export function parseAttrs(attrStr: string): Attrs {
  const attrs: Attrs = {};
  // Match: key="val", key='val', key=val, or standalone key
  const re = /([\w][\w-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) {
    const key = m[1];
    if (m[2] !== undefined) attrs[key] = m[2];
    else if (m[3] !== undefined) attrs[key] = m[3];
    else if (m[4] !== undefined) attrs[key] = m[4];
    else attrs[key] = true;
  }
  return attrs;
}

/**
 * Strip `data-` prefix from attribute keys. Returns a new object.
 * Attributes without the prefix are kept as-is.
 */
export function stripDataPrefix(attrs: Attrs): Attrs {
  const result: Attrs = {};
  for (const [k, v] of Object.entries(attrs)) {
    result[k.startsWith("data-") ? k.slice(5) : k] = v;
  }
  return result;
}

/**
 * Parse a document string for `<template>` definitions and target blocks
 * (elements with a `data-src` attribute).
 *
 * Uses htmlparser2 for correct attribute parsing and nesting.
 * `<template>` elements inside other `<template>` bodies are NOT extracted
 * as separate templates; they appear as literal text in the outer template
 * body and are resolved during rendering.
 * Elements with `data-src` that appear inside `<template>` bodies are
 * likewise skipped — they are processed when the template is rendered.
 */
export function parseDocument(source: string): ParseResult {
  const templates: TemplateDef[] = [];
  const targets: TargetBlock[] = [];

  // Depth counter: how many <template> elements deep we currently are.
  // When > 0, we are inside a template body and should not process data-src targets.
  let templateDepth = 0;

  // State for the outermost open <template> element being captured.
  let currentTemplate: {
    attrs: Attrs;
    openStart: number;
    openEnd: number;
  } | null = null;

  // Stack of pending target block elements (to handle arbitrary nesting).
  interface PendingTarget {
    tag: string;
    attrs: Attrs;
    openStart: number;
    openEnd: number;
  }
  const targetStack: PendingTarget[] = [];

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        const openStart = parser.startIndex;
        const openEnd = parser.endIndex;

        if (name === "template") {
          if (templateDepth === 0) {
            // Outermost <template>: start capturing
            currentTemplate = {
              attrs: stripDataPrefix(fromHtmlAttribs(attribs)),
              openStart,
              openEnd,
            };
          }
          templateDepth++;
          return;
        }

        // Skip data-src elements inside template bodies
        if (templateDepth > 0) return;

        if ("data-src" in attribs) {
          targetStack.push({
            tag: name,
            attrs: stripDataPrefix(fromHtmlAttribs(attribs)),
            openStart,
            openEnd,
          });
        }
      },

      onclosetag(name, isImplied) {
        if (name === "template") {
          templateDepth--;
          if (templateDepth === 0 && currentTemplate !== null) {
            // Body is everything between end of opening tag and start of this closing tag
            const body = source.slice(
              currentTemplate.openEnd + 1,
              parser.startIndex,
            );
            const { attrs } = currentTemplate;
            const id = typeof attrs["id"] === "string" ? attrs["id"] : "";

            templates.push({
              id,
              body,
              attrs,
              nameMatch: strToRegex(attrs["name-match"]),
              pathMatch: strToRegex(attrs["path-match"]),
              contentMatch: strToRegex(attrs["content-match"]),
              open: typeof attrs["open"] === "string" ? attrs["open"] : "{",
              close: typeof attrs["close"] === "string" ? attrs["close"] : "}",
              pipe: typeof attrs["pipe"] === "string" ? attrs["pipe"] : "|",
              break: attrs["break"] === true || attrs["break"] === "true",
            });
            currentTemplate = null;
          }
          return;
        }

        if (templateDepth > 0) return;

        // Find the innermost matching target in the stack
        let stackIdx = -1;
        for (let i = targetStack.length - 1; i >= 0; i--) {
          if (targetStack[i].tag === name) {
            stackIdx = i;
            break;
          }
        }
        if (stackIdx === -1) return;

        const el = targetStack.splice(stackIdx, 1)[0];

        let openTag: string;
        let existingContent: string;
        let closeTag: string;
        let end: number;

        if (isImplied) {
          // Self-closing element: <tag /> — no closing tag in source
          openTag = source.slice(el.openStart, el.openEnd + 1);
          existingContent = "";
          closeTag = "";
          end = el.openEnd + 1;
        } else {
          openTag = source.slice(el.openStart, el.openEnd + 1);
          existingContent = source.slice(el.openEnd + 1, parser.startIndex);
          closeTag = `</${name}>`;
          end = parser.endIndex + 1;
        }

        targets.push({
          tag: name,
          openTag,
          closeTag,
          existingContent,
          fullMatch: source.slice(el.openStart, end),
          start: el.openStart,
          end,
          attrs: el.attrs,
        });
      },
    },
    {
      lowerCaseTags: false,
      lowerCaseAttributeNames: false,
      recognizeSelfClosing: true,
    },
  );

  parser.write(source);
  parser.end();

  return { templates, targets };
}

/**
 * Convert htmlparser2 attribute map to our `Attrs` type.
 * htmlparser2 represents boolean attributes (no value) as empty string `""`;
 * we convert those to `true` to match the expected `Attrs` shape.
 */
function fromHtmlAttribs(attribs: Record<string, string>): Attrs {
  const result: Attrs = {};
  for (const [k, v] of Object.entries(attribs)) {
    result[k] = v === "" ? true : v;
  }
  return result;
}

/** Convert a string to a RegExp, returning undefined if falsy */
function strToRegex(val: string | true | undefined): RegExp | undefined {
  if (!val || val === true) return undefined;
  try {
    return new RegExp(val);
  } catch {
    return undefined;
  }
}
