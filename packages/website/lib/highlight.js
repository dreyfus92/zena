import {readFile} from 'node:fs/promises';
import {createHighlighter} from 'shiki';
import {xCircleFill} from '@radica/bootstrap-icons/icons/x-circle-fill.svg.js';
import {exclamationTriangleFill} from '@radica/bootstrap-icons/icons/exclamation-triangle-fill.svg.js';

const GRAMMAR_PATH = new URL(
  '../../vscode-zena/syntaxes/zena.tmLanguage.json',
  import.meta.url,
);

/** Themes match VitePress's defaults so the ported CSS lines up. */
export const THEMES = {light: 'github-light', dark: 'github-dark'};

/** Languages used in the docs, beyond Zena itself. */
const LANGS = [
  'bash',
  'diff',
  'html',
  'javascript',
  'json',
  'markdown',
  'rust',
  'toml',
  'typescript',
  'wasm',
  'yaml',
];

/** `wat` is what everyone writes in fences; Shiki calls the grammar `wasm`. */
const LANG_ALIASES = {
  wat: 'wasm',
  ts: 'typescript',
  js: 'javascript',
  sh: 'bash',
};

/**
 * Loads the same TextMate grammar the VS Code extension ships, so code samples
 * on the site and in the editor highlight identically.
 */
const loadZenaGrammar = async () => {
  const grammar = JSON.parse(await readFile(GRAMMAR_PATH, 'utf8'));
  // Shiki keys grammars by `name`; the file's own name is the display name.
  return {...grammar, name: 'zena', displayName: 'Zena'};
};

export const createZenaHighlighter = async () =>
  createHighlighter({
    themes: Object.values(THEMES),
    langs: [...LANGS, await loadZenaGrammar()],
  });

/**
 * Diagnostic annotation extracted from code comments.
 *
 * @typedef {Object} CodeDiagnostic
 * @property {number} lineIndex - 0-based line index in cleaned code
 * @property {number} startCol - 0-based start column (inclusive)
 * @property {number} endCol - 0-based end column (exclusive)
 * @property {'error'|'warning'} severity
 * @property {string} message
 */

/** Extracts the SVG path definition from a Radica bootstrap icon Lit template. */
const extractIconPath = (iconTemplate) =>
  /d="([^"]+)"/.exec(iconTemplate?.strings?.[0] ?? '')?.[1] ?? '';

const ERROR_ICON_PATH = extractIconPath(xCircleFill);
const WARNING_ICON_PATH = extractIconPath(exclamationTriangleFill);

const createSvgHast = (path) => ({
  type: 'element',
  tagName: 'svg',
  properties: {
    class: 'code-diagnostic-icon',
    viewBox: '0 0 16 16',
    width: '14',
    height: '14',
    fill: 'currentColor',
    'aria-hidden': 'true',
  },
  children: [
    {
      type: 'element',
      tagName: 'path',
      properties: {d: path},
      children: [],
    },
  ],
});

const ERROR_SVG_HAST = createSvgHast(ERROR_ICON_PATH);
const WARNING_SVG_HAST = createSvgHast(WARNING_ICON_PATH);

/**
 * Extracts inline diagnostic annotations (carets, token directives, or same-line
 * error/warning comments) from code blocks and returns the cleaned code along
 * with structured diagnostic metadata for Shiki.
 *
 * @param {string} code
 * @returns {{cleanedCode: string, diagnostics: CodeDiagnostic[]}}
 */
export const extractDiagnostics = (code) => {
  const endsWithNewline = code.endsWith('\n');
  const lines = code.split(/\r?\n/);
  // If the string ended with \n, the last entry is empty string from split.
  if (endsWithNewline && lines[lines.length - 1] === '') {
    lines.pop();
  }

  const cleanedLines = [];
  /** @type {CodeDiagnostic[]} */
  const diagnostics = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 1. Same-line directive: `code... // @error: message` or `// @warning: message`
    // Optionally with a target token: `code... // @error("tok"): message`
    const sameLineMatch = line.match(
      /^(.*\S)\s*(?:\/\/|#)\s*@(error|warning)(?:\((['"])(.*?)\3\))?:\s*(.*)$/,
    );
    if (sameLineMatch) {
      const codePart = sameLineMatch[1].trimEnd();
      const severity = sameLineMatch[2].toLowerCase();
      const token = sameLineMatch[4];
      const message = sameLineMatch[5].trim();

      const indentMatch = codePart.match(/^\s*/);
      const leadingSpaces = indentMatch ? indentMatch[0].length : 0;
      const trimmedEnd = codePart.trimEnd().length;
      let startCol = Math.min(leadingSpaces, trimmedEnd);
      let endCol = trimmedEnd;

      if (token) {
        const tokenIdx = codePart.indexOf(token);
        if (tokenIdx !== -1) {
          startCol = tokenIdx;
          endCol = tokenIdx + token.length;
        }
      }

      const lineIndex = cleanedLines.length;
      cleanedLines.push(codePart);
      diagnostics.push({
        lineIndex,
        startCol,
        endCol,
        severity: severity === 'warning' ? 'warning' : 'error',
        message: message || (severity === 'warning' ? 'Warning' : 'Error'),
      });
      continue;
    }

    // 2. Standalone token directive: `// @error("token"): message` or `// @error: message`
    const tokenDirectiveMatch = line.match(
      /^\s*(?:\/\/|#)\s*@(error|warning)(?:\((['"])(.*?)\2\))?:\s*(.*)$/,
    );
    if (tokenDirectiveMatch) {
      const severity = tokenDirectiveMatch[1].toLowerCase();
      const token = tokenDirectiveMatch[3];
      const message = tokenDirectiveMatch[4].trim();

      const targetLineIdx = Math.max(0, cleanedLines.length - 1);
      const targetLine = cleanedLines[targetLineIdx] ?? '';

      const indentMatch = targetLine.match(/^\s*/);
      const leadingSpaces = indentMatch ? indentMatch[0].length : 0;
      const trimmedEnd = targetLine.trimEnd().length;
      let startCol = Math.min(leadingSpaces, trimmedEnd);
      let endCol = trimmedEnd;
      if (token) {
        const tokenIdx = targetLine.indexOf(token);
        if (tokenIdx !== -1) {
          startCol = tokenIdx;
          endCol = tokenIdx + token.length;
        }
      }

      diagnostics.push({
        lineIndex: targetLineIdx,
        startCol,
        endCol,
        severity: severity === 'warning' ? 'warning' : 'error',
        message: message || (severity === 'warning' ? 'Warning' : 'Error'),
      });
      // Omit this comment line from cleanedLines
      continue;
    }

    // 3. Caret line: `//   ^^^^ error: message` or `//^^^ error: message`
    const caretMatch = line.match(/^(\s*)(?:\/\/|#)(\s*)([\^~]+)\s*(.*)$/);
    if (caretMatch) {
      const indent = caretMatch[1];
      const innerSpaces = caretMatch[2];
      const carets = caretMatch[3];
      const rest = caretMatch[4];

      const targetLineIdx = Math.max(0, cleanedLines.length - 1);
      const targetLine = cleanedLines[targetLineIdx] ?? '';

      let startCol = 0;
      let endCol = targetLine.length;

      // When the comment begins at column 0 and carets immediately follow `//`,
      // target column 0.
      if (indent.length === 0 && innerSpaces.length === 0) {
        startCol = 0;
        if (carets.length > 1) {
          endCol = 2 + carets.length;
        } else if (targetLine.length > 0 && /\w/.test(targetLine[0])) {
          let e = 0;
          while (e < targetLine.length && /\w/.test(targetLine[e])) e++;
          endCol = e;
        } else {
          endCol = 1;
        }
      } else {
        const col = line.indexOf(carets[0]);
        startCol = col;
        if (carets.length > 1) {
          endCol = col + carets.length;
        } else if (
          col >= 0 &&
          col < targetLine.length &&
          /\w/.test(targetLine[col])
        ) {
          let s = col;
          while (s > 0 && /\w/.test(targetLine[s - 1])) s--;
          let e = col;
          while (e < targetLine.length && /\w/.test(targetLine[e])) e++;
          startCol = s;
          endCol = e;
        } else {
          endCol = col + 1;
        }
      }

      // Parse severity and message
      const sevMatch = rest.match(/^(?:\[?(error|warning)\]?[:\s]+)?(.*)$/i);
      const rawSev = sevMatch?.[1]?.toLowerCase();
      const severity = rawSev === 'warning' ? 'warning' : 'error';
      let message = sevMatch?.[2]?.trim() || '';
      if (message.startsWith(':')) message = message.slice(1).trim();
      if (message.startsWith('-')) message = message.slice(1).trim();
      if (!message) {
        message = severity === 'warning' ? 'Warning' : 'Error';
      }

      diagnostics.push({
        lineIndex: targetLineIdx,
        startCol,
        endCol,
        severity,
        message,
      });
      // Omit this comment line from cleanedLines
      continue;
    }

    cleanedLines.push(line);
  }

  let cleanedCode = cleanedLines.join('\n');
  if (endsWithNewline) {
    cleanedCode += '\n';
  }

  return {cleanedCode, diagnostics};
};

/**
 * Renders one code block in VitePress's markup:
 *
 *     <div class="language-zena adaptive-theme">
 *       <button class="copy"></button>
 *       <span class="lang">zena</span>
 *       <pre class="shiki … code-block"><code>…</code></pre>
 *     </div>
 *
 * `defaultColor: false` makes Shiki emit `--shiki-light` / `--shiki-dark`
 * custom properties instead of concrete colours, which is what lets a single
 * render serve both themes (see css/vitepress/components/code-block.css).
 */
export const renderCodeBlock = (highlighter, code, lang, label) => {
  const aliased = LANG_ALIASES[lang] ?? lang;
  const known = highlighter.getLoadedLanguages().includes(aliased);
  const resolved = known ? aliased : 'text';

  const {cleanedCode, diagnostics} = extractDiagnostics(code);

  const decorations = diagnostics.map((d) => ({
    start: {line: d.lineIndex, character: d.startCol},
    end: {line: d.lineIndex, character: d.endCol},
    properties: {
      class: d.severity === 'warning' ? 'code-warning-span' : 'code-error-span',
      title: `${d.severity === 'warning' ? 'Warning' : 'Error'}: ${d.message}`,
    },
  }));

  const transformers = [
    {
      pre(node) {
        node.properties['class'] = `${node.properties['class']} code-block`;
      },
    },
  ];

  if (diagnostics.length > 0) {
    transformers.push({
      name: 'code-inline-diagnostics',
      code(codeEl) {
        const lineElements = codeEl.children.filter(
          (child) =>
            child.type === 'element' &&
            child.tagName === 'span' &&
            child.properties?.class?.includes('line'),
        );

        const byLine = new Map();
        for (const d of diagnostics) {
          if (!byLine.has(d.lineIndex)) byLine.set(d.lineIndex, []);
          byLine.get(d.lineIndex).push(d);
        }

        const sortedLineIndices = [...byLine.keys()].sort((a, b) => b - a);

        for (const lineIdx of sortedLineIndices) {
          const lineEl = lineElements[lineIdx];
          if (!lineEl) continue;

          const childIdx = codeEl.children.indexOf(lineEl);
          if (childIdx === -1) continue;

          // If followed by a newline text node, insert after the newline
          const hasNewline =
            codeEl.children[childIdx + 1]?.type === 'text' &&
            codeEl.children[childIdx + 1]?.value === '\n';
          const insertIdx = hasNewline ? childIdx + 2 : childIdx + 1;

          const diagsForLine = byLine.get(lineIdx);
          const nodesToInsert = [];
          for (const d of diagsForLine) {
            const isWarning = d.severity === 'warning';
            const iconSvg = isWarning ? WARNING_SVG_HAST : ERROR_SVG_HAST;
            const labelText = isWarning ? 'Warning:' : 'Error:';

            nodesToInsert.push({
              type: 'element',
              tagName: 'div',
              properties: {
                class: `code-diagnostic code-diagnostic-${d.severity}`,
                role: 'alert',
              },
              children: [
                iconSvg,
                {
                  type: 'element',
                  tagName: 'span',
                  properties: {class: 'code-diagnostic-label'},
                  children: [{type: 'text', value: labelText}],
                },
                {
                  type: 'element',
                  tagName: 'span',
                  properties: {class: 'code-diagnostic-message'},
                  children: [{type: 'text', value: d.message}],
                },
              ],
            });
            nodesToInsert.push({type: 'text', value: '\n'});
          }

          codeEl.children.splice(insertIdx, 0, ...nodesToInsert);
        }
      },
    });
  }

  const pre = highlighter.codeToHtml(cleanedCode, {
    lang: resolved,
    themes: THEMES,
    defaultColor: false,
    decorations,
    transformers,
  });

  return (
    `<div class="language-${resolved} adaptive-theme">` +
    `<button title="Copy Code" class="copy"></button>` +
    `<span class="lang">${label ?? resolved}</span>` +
    pre +
    `</div>`
  );
};
