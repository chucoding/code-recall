import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import { github } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { highlightText } from '@/shared/lib/highlightText';
import { FileText } from 'lucide-react';
import 'github-markdown-css/github-markdown.css';

const MONO_STYLE: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  fontSize: '13px',
  lineHeight: '1.45',
};

function getDiffLineStyle(lineContent: string): React.CSSProperties {
  const style: React.CSSProperties = { display: 'block', whiteSpace: 'pre' };
  if (lineContent.startsWith('+') && !lineContent.startsWith('+++')) {
    style.backgroundColor = 'rgba(46, 160, 67, 0.15)';
    style.borderLeft = '3px solid #2ea043';
  } else if (lineContent.startsWith('-') && !lineContent.startsWith('---')) {
    style.backgroundColor = 'rgba(248, 81, 73, 0.15)';
    style.borderLeft = '3px solid #f85149';
  } else if (lineContent.startsWith('@@')) {
    style.backgroundColor = 'rgba(84, 174, 255, 0.12)';
    style.fontWeight = 600;
  }
  return style;
}

interface CodeDiffBlockProps {
  diffContent: string;
  highlightStrings?: string[];
}

const CodeDiffBlock: React.FC<CodeDiffBlockProps> = ({ diffContent, highlightStrings }) => {
  return (
    <div className="markdown-body code-diff-content min-w-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const isDiff = match && match[1] === 'diff';

            if (!inline && match) {
              if (isDiff) {
                const raw = String(children).replace(/\n$/, '');
                const lines = raw.split('\n');
                const hasHighlights = highlightStrings && highlightStrings.length > 0;
                return (
                  <div className="my-3 border border-slate-200 rounded-xl min-w-0 overflow-x-auto">
                    <pre className="m-0 p-3 pr-6 min-w-0" style={{ ...MONO_STYLE, whiteSpace: 'pre' }}>
                      <code className="fc-diff-code" style={{ ...MONO_STYLE, whiteSpace: 'pre' }}>
                        {hasHighlights
                          ? lines.map((line, i) => (
                              <div key={i} style={getDiffLineStyle(line)}>
                                {highlightText(line, highlightStrings!)}
                              </div>
                            ))
                          : lines.map((line, i) => (
                              <div key={i} style={getDiffLineStyle(line)}>
                                {line}
                              </div>
                            ))}
                      </code>
                    </pre>
                  </div>
                );
              }

              return (
                <SyntaxHighlighter
                  style={github}
                  language={match[1]}
                  PreTag="div"
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
          h2: ({ children }) => (
            <h2 className="text-[1.5em] font-semibold mt-6 mb-4 border-b border-[#d0d7de] pb-2">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-[1.25em] font-semibold mt-5 mb-3 text-[#24292f] flex items-start gap-2 min-w-0">
              <FileText className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />
              <span className="break-all min-w-0">{children}</span>
            </h3>
          ),
        }}
      >
        {diffContent}
      </ReactMarkdown>
    </div>
  );
};

export default CodeDiffBlock;
