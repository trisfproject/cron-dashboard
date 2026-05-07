'use client';

import { useMemo, useState } from 'react';
import { Clipboard, Maximize2, Minimize2 } from 'lucide-react';

const ISSUE_PATTERNS = [
  { label: 'SQLSTATE', pattern: /\bSQLSTATE\b/i, className: 'text-fuchsia-300' },
  { label: 'Exception', pattern: /\b(exception|traceback|stack trace)\b/i, className: 'text-rose-300' },
  { label: 'Timeout', pattern: /\b(time[\s-]?out|timed out|deadline exceeded)\b/i, className: 'text-orange-300' },
  { label: 'Retry', pattern: /\b(retry|retrying|attempt \d+)\b/i, className: 'text-blue-300' },
  { label: 'Warning', pattern: /\b(warn|warning)\b/i, className: 'text-amber-300' },
  { label: 'Error', pattern: /\b(error|failed|failure|fatal)\b/i, className: 'text-rose-300' }
];

function getOutputValue(log, keys) {
  return keys
    .map((key) => log?.[key])
    .find((value) => typeof value === 'string' && value.trim().length > 0) || '';
}

function buildOutputSections(log) {
  const sections = [
    { title: 'stdout', value: getOutputValue(log, ['stdout']) },
    { title: 'stderr', value: getOutputValue(log, ['stderr']) },
    { title: 'warnings', value: getOutputValue(log, ['warning_messages', 'warnings']) },
    { title: 'exception', value: getOutputValue(log, ['exception_trace', 'exception', 'stacktrace']) },
    { title: 'retry logs', value: getOutputValue(log, ['retry_logs', 'retries']) },
    { title: 'timeout', value: getOutputValue(log, ['timeout_info', 'timeout']) },
    { title: 'output', value: getOutputValue(log, ['output', 'message']) }
  ].filter((section) => section.value);

  if (sections.length > 0) {
    return sections;
  }

  if (log?.command) {
    return [{ title: 'command context', value: log.command }];
  }

  return [];
}

function classifyIssue(text, status) {
  const explicit = ISSUE_PATTERNS.find((item) => item.pattern.test(text));

  if (explicit) {
    return explicit.label;
  }

  return {
    0: 'No issue detected',
    1: 'Failed execution',
    2: 'Warning execution'
  }[Number(status)] || 'Unclassified';
}

function lineClassName(line) {
  const match = ISSUE_PATTERNS.find((item) => item.pattern.test(line));
  return match?.className || 'text-slate-200';
}

function extractStacktrace(sections) {
  const traceSection = sections.find((section) => /exception|stderr|output/i.test(section.title));
  const value = traceSection?.value || '';
  const lines = value.split('\n');
  const startIndex = lines.findIndex((line) => /\b(exception|traceback|stack trace|error|fatal)\b/i.test(line));

  if (startIndex === -1) {
    return value;
  }

  return lines.slice(startIndex).join('\n');
}

function copyText(value) {
  if (typeof navigator === 'undefined' || !navigator.clipboard || !value) {
    return;
  }

  navigator.clipboard.writeText(value).catch(() => {});
}

export function ExecutionOutputInspector({ log, compact = false }) {
  const [expanded, setExpanded] = useState(false);
  const [fullOutput, setFullOutput] = useState(false);

  const sections = useMemo(() => buildOutputSections(log), [log]);
  const combinedOutput = useMemo(
    () => sections.map((section) => `[${section.title}]\n${section.value}`).join('\n\n'),
    [sections]
  );
  const issueType = useMemo(() => classifyIssue(combinedOutput, log?.status), [combinedOutput, log?.status]);
  const stacktrace = useMemo(() => extractStacktrace(sections), [sections]);

  if (sections.length === 0) {
    return (
      <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-800">
        No execution output captured for this run.
      </div>
    );
  }

  const visibleSections = fullOutput ? sections : sections.slice(0, 3);

  return (
    <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
      >
        <span className="min-w-0">
          <span className="block text-xs uppercase tracking-normal text-slate-500">Detected issue type</span>
          <span className="block truncate">{issueType}</span>
        </span>
        <span className="shrink-0 text-xs text-blue-700 dark:text-blue-300">
          {expanded ? 'Collapse output' : 'Inspect output'}
        </span>
      </button>

      {expanded ? (
        <div className="space-y-3 border-t border-slate-200 p-3 dark:border-slate-800">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => copyText(combinedOutput)}
              className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
            >
              <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />
              Copy output
            </button>
            <button
              type="button"
              onClick={() => copyText(stacktrace)}
              className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
            >
              <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />
              Copy stacktrace
            </button>
            <button
              type="button"
              onClick={() => setFullOutput((value) => !value)}
              className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
            >
              {fullOutput ? <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />}
              {fullOutput ? 'Collapse output' : 'Expand full output'}
            </button>
          </div>

          {visibleSections.map((section) => {
            const lines = section.value.split('\n');
            const displayedLines = fullOutput ? lines : lines.slice(0, compact ? 40 : 80);
            const truncated = displayedLines.length < lines.length;

            return (
              <div key={section.title}>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{section.title}</p>
                  <span className="text-xs text-slate-400">{lines.length.toLocaleString()} lines</span>
                </div>
                <pre className="max-h-80 overflow-auto rounded-md bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-200 shadow-inner">
                  {displayedLines.map((line, index) => (
                    <span key={`${section.title}-${index}`} className={`block whitespace-pre-wrap break-words ${lineClassName(line)}`}>
                      {line || ' '}
                    </span>
                  ))}
                  {truncated ? (
                    <span className="mt-2 block text-slate-400">Output truncated. Use "Expand full output" to inspect more lines.</span>
                  ) : null}
                </pre>
              </div>
            );
          })}

          {!fullOutput && sections.length > visibleSections.length ? (
            <p className="text-xs text-slate-500">
              {sections.length - visibleSections.length} more output sections hidden. Expand full output to inspect everything.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
