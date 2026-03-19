import { useState } from 'react';
import { api } from '../api/client';
import type { ReportResult, ShareResult } from '../api/client';

interface ReportPanelProps {
  visible: boolean;
}

export function ReportPanel({ visible }: ReportPanelProps) {
  const [format, setFormat] = useState<'markdown' | 'html'>('markdown');
  const [report, setReport] = useState<ReportResult | null>(null);
  const [shareResult, setShareResult] = useState<ShareResult | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [loadingShare, setLoadingShare] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!visible) return null;

  const handleGenerate = async () => {
    setLoadingReport(true);
    setError(null);
    setReport(null);
    setShareResult(null);
    try {
      const result = await api.generateReport(format);
      setReport(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate report');
    } finally {
      setLoadingReport(false);
    }
  };

  const handleShare = async () => {
    setLoadingShare(true);
    setError(null);
    try {
      const result = await api.shareSession();
      setShareResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to share session');
    } finally {
      setLoadingShare(false);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  const handleDownload = () => {
    if (!report) return;
    const blob = new Blob([report.content], {
      type: format === 'html' ? 'text/html' : 'text/markdown',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `loki-report.${format === 'html' ? 'html' : 'md'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="glass p-4 rounded-2xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-charcoal uppercase tracking-wider">
          Session Report
        </h3>
        <div className="flex items-center gap-2">
          {/* Format selector */}
          <div className="flex items-center gap-1 glass-subtle rounded-xl p-1">
            {(['markdown', 'html'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  format === f
                    ? 'bg-accent-product text-white shadow-sm'
                    : 'text-slate hover:text-charcoal hover:bg-white/40'
                }`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            onClick={handleGenerate}
            disabled={loadingReport}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-accent-product text-white hover:bg-accent-product/90 disabled:opacity-50 transition-all"
          >
            {loadingReport ? 'Generating...' : 'Generate Report'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs">
          {error}
        </div>
      )}

      {report && (
        <div className="mt-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-slate">
              Report generated ({report.format})
            </span>
            <div className="flex-1" />
            <button
              onClick={() => handleCopy(report.content)}
              className="px-3 py-1 text-xs font-medium text-slate hover:text-charcoal border border-white/30 rounded-lg hover:bg-white/30 transition-all"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={handleDownload}
              className="px-3 py-1 text-xs font-medium text-slate hover:text-charcoal border border-white/30 rounded-lg hover:bg-white/30 transition-all"
            >
              Download
            </button>
            <button
              onClick={handleShare}
              disabled={loadingShare}
              className="px-3 py-1 text-xs font-medium bg-accent-product/10 text-accent-product border border-accent-product/20 rounded-lg hover:bg-accent-product/20 disabled:opacity-50 transition-all"
            >
              {loadingShare ? 'Sharing...' : 'Share as Gist'}
            </button>
          </div>

          {shareResult && (
            <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-success/10 border border-success/20">
              <span className="text-xs text-success font-medium">Shared:</span>
              {shareResult.url ? (
                <a
                  href={shareResult.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-accent-product underline flex-1 truncate"
                >
                  {shareResult.url}
                </a>
              ) : (
                <span className="text-xs text-slate flex-1">No URL returned</span>
              )}
              {shareResult.url && (
                <button
                  onClick={() => handleCopy(shareResult.url)}
                  className="text-xs text-slate hover:text-charcoal"
                >
                  Copy URL
                </button>
              )}
            </div>
          )}

          <pre className="text-[11px] font-mono text-charcoal bg-black/5 rounded-xl p-3 overflow-auto max-h-64 whitespace-pre-wrap terminal-scroll">
            {report.content || '(empty report)'}
          </pre>
        </div>
      )}
    </div>
  );
}
