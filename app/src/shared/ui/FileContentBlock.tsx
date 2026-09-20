import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import { github } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { highlightText, injectHighlightMarkup, HIGHLIGHT_CLASS } from '@/shared/lib/highlightText';
import 'github-markdown-css/github-markdown.css';

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  json: 'json',
  css: 'css',
  scss: 'scss',
  html: 'html',
  md: 'markdown',
  markdown: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  sh: 'bash',
  bash: 'bash',
  sql: 'sql',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
};

function getLanguageFromFilename(filename: string): string {
  const ext = filename.replace(/^.*\./, '').toLowerCase();
  return EXT_TO_LANG[ext] ?? ext;
}

function isMarkdownFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
}

const MONO_STYLE: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  fontSize: '13px',
  lineHeight: '1.45',
};

interface FileContentBlockProps {
  content: string;
  filename?: string;
  highlightStrings?: string[];
}

const FileContentBlock: React.FC<FileContentBlockProps> = ({ content, filename = '', highlightStrings }) => {
  if (isMarkdownFile(filename)) {
    const contentToRender =
      highlightStrings && highlightStrings.length > 0
        ? injectHighlightMarkup(content, highlightStrings, HIGHLIGHT_CLASS)
        : content;
    return (
      <div className="markdown-body w-full p-6 box-border text-left bg-white">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={{
            code({ inline, className, children, ...props }: any) {
              const match = /language-(\w+)/.exec(className || '');
              if (!inline && match) {
                return (
                  <SyntaxHighlighter
                    style={github}
                    language={match[1]}
                    PreTag="div"
                    customStyle={{ margin: '0.5em 0', borderRadius: '6px', fontSize: '13px', overflowX: 'auto' }}
                    codeTagProps={{
                      style: {
                        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                      },
                    }}
                    {...props}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                );
              }
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
          }}
        >
          {contentToRender}
        </ReactMarkdown>
      </div>
    );
  }

  const language = getLanguageFromFilename(filename) || 'text';
  const lines = content.split('\n');
  const hasHighlights = highlightStrings && highlightStrings.length > 0;

  if (hasHighlights) {
    return (
      <div className="w-full p-4 bg-slate-50 rounded-b-3xl border border-slate-200 border-t-0 box-border min-w-0">
        <pre className="m-0 pr-4 overflow-x-auto min-w-0" style={{ ...MONO_STYLE, whiteSpace: 'pre' }}>
          <code style={{ ...MONO_STYLE, whiteSpace: 'pre' }}>
            {lines.map((line, i) => (
              <div key={i} className="block whitespace-pre">
                {highlightText(line, highlightStrings!)}
              </div>
            ))}
          </code>
        </pre>
      </div>
    );
  }

  return (
    <div className="w-full p-4 bg-slate-50 rounded-b-3xl border border-slate-200 border-t-0 box-border min-w-0">
      <SyntaxHighlighter
        style={github}
        language={language}
        PreTag="div"
        customStyle={{
          margin: 0,
          padding: 0,
          background: 'transparent',
          fontSize: '13px',
          lineHeight: '1.45',
          overflowX: 'auto',
        }}
        codeTagProps={{
          style: MONO_STYLE,
        }}
        showLineNumbers={lines.length > 5}
      >
        {content}
      </SyntaxHighlighter>
    </div>
  );
};

export default FileContentBlock;
