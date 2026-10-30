import React from 'react';

// Minimal Markdown renderer for AI answers: headings, bullet/numbered lists, bold,
// inline code and paragraphs. It builds React elements (never innerHTML), so model
// output can't inject markup.

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={`${keyPrefix}-${i++}`}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<code key={`${keyPrefix}-${i++}`}>{token.slice(1, -1)}</code>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export const MarkdownView: React.FC<{ text: string }> = ({ text }) => {
  const blocks: React.ReactNode[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let list: { ordered: boolean; items: string[] } | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      const key = `p-${blocks.length}`;
      blocks.push(<p key={key}>{renderInline(paragraph.join(' '), key)}</p>);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      const key = `l-${blocks.length}`;
      const items = list.items.map((item, idx) => <li key={idx}>{renderInline(item, `${key}-${idx}`)}</li>);
      blocks.push(list.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>);
      list = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);

    if (!line) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      const key = `h-${blocks.length}`;
      const level = Math.min(heading[1].length + 2, 6);
      blocks.push(React.createElement(`h${level}`, { key }, renderInline(heading[2].replace(/#+$/, '').trim(), key)));
    } else if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push((bullet || numbered)![1]);
    } else if (/^(-{3,}|\*{3,})$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push(<hr key={`hr-${blocks.length}`} />);
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();

  return <div className="ai-rendered-output markdown-body">{blocks}</div>;
};
