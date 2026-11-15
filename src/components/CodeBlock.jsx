import React, { useMemo } from 'react';

const KEYWORDS = new Set([
  'function', 'external', 'public', 'private', 'internal', 'view', 'returns', 'return', 'require', 'emit', 'if', 'else',
  'for', 'memory', 'storage', 'calldata', 'modifier', 'event', 'struct', 'mapping', 'contract', 'pragma', 'solidity',
  'true', 'false', 'indexed',
]);
const TYPES = new Set(['uint256', 'uint64', 'address', 'bool', 'string', 'bytes']);
const GLOBALS = new Set(['msg', 'block']);

/** Minimal Solidity highlighter: comments, strings, numbers, keywords, types and calls. */
function tokenize(code) {
  const out = [];
  const re = /(\/\/[^\n]*)|("(?:[^"\\]|\\.)*")|(\b\d+\b)|([A-Za-z_][A-Za-z0-9_]*)|(\s+)|([^\sA-Za-z0-9_"])/g;
  let m;
  while ((m = re.exec(code))) {
    const [text, comment, str, num, word] = m;
    let cls = null;
    if (comment) cls = 'c';
    else if (str) cls = 's';
    else if (num) cls = 'n';
    else if (word) {
      if (KEYWORDS.has(word)) cls = 'k';
      else if (TYPES.has(word)) cls = 't';
      else if (GLOBALS.has(word)) cls = 'g';
      else if (code[re.lastIndex] === '(') cls = 'f';
    }
    out.push({ text, cls });
  }
  return out;
}

export function CodeBlock({ code, caption }) {
  const tokens = useMemo(() => tokenize(code), [code]);
  return (
    <figure className="code-figure">
      {caption && <figcaption>{caption}</figcaption>}
      <pre className="code" tabIndex={0}>
        <code>
          {tokens.map((t, i) =>
            t.cls ? (
              <span key={i} className={`tk-${t.cls}`}>
                {t.text}
              </span>
            ) : (
              t.text
            )
          )}
        </code>
      </pre>
    </figure>
  );
}
