import { useCallback } from 'react';
import { api } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import type { SessionHistoryItem } from '../api/client';

interface SessionHistoryProps {
  onLoadSession?: (item: SessionHistoryItem) => void;
}

export function SessionHistory({ onLoadSession }: SessionHistoryProps) {
  const fetchHistory = useCallback(() => api.getSessionsHistory(), []);
  const { data: sessions, loading } = usePolling(fetchHistory, 60000, true);

  if (loading && !sessions) {
    return (
      <div className="glass p-4 rounded-2xl">
        <h3 className="text-sm font-semibold text-charcoal uppercase tracking-wider mb-3">Past Builds</h3>
        <div className="text-sm text-slate">Loading...</div>
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return null; // Hide if no history
  }

  return (
    <div className="glass p-4 rounded-2xl">
      <h3 className="text-sm font-semibold text-charcoal uppercase tracking-wider mb-3">Past Builds</h3>
      <div className="flex flex-col gap-2 max-h-48 overflow-y-auto terminal-scroll">
        {sessions.map((item) => (
          <button
            key={item.id}
            onClick={() => onLoadSession?.(item)}
            className="text-left px-3 py-2 rounded-xl glass-subtle hover:bg-white/40 transition-all group"
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] font-mono text-slate">{item.date}</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${
                item.status === 'complete' || item.status === 'done'
                  ? 'bg-success/10 text-success'
                  : item.status === 'error' || item.status === 'failed'
                  ? 'bg-danger/10 text-danger'
                  : 'bg-slate/10 text-slate'
              }`}>
                {item.status}
              </span>
            </div>
            <div className="text-xs text-charcoal truncate group-hover:text-accent-product transition-colors">
              {item.prd_snippet || item.id}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
