import { StatusResponse } from '../types/api';
import { ProviderPanel } from './ProviderPanel';

interface HeaderProps {
  status: StatusResponse | null;
  wsConnected: boolean;
  onProviderChange?: (provider: string) => void;
  selectedProvider?: string;
}

export function Header({ status, wsConnected, onProviderChange, selectedProvider }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 glass border-b border-white/20">
      <div className="max-w-[1920px] mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight">
            <span className="text-accent-product">Purple</span>
            <span className="text-charcoal"> Lab</span>
          </h1>
          <span className="text-[10px] font-mono text-slate px-2 py-0.5 rounded-full bg-surface/50">
            Powered by Loki Mode
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* Connection indicator */}
          <div className="flex items-center gap-2 text-sm">
            <div
              className={`w-2 h-2 rounded-full ${
                wsConnected ? 'bg-success' : 'bg-danger'
              }`}
            />
            <span className="text-slate text-xs font-medium">
              {wsConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          {/* Running status */}
          {status && (
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  status.paused
                    ? 'bg-warning'
                    : status.running
                    ? 'bg-success phase-active'
                    : 'bg-slate/30'
                }`}
              />
              <span className="text-sm font-medium text-charcoal">
                {status.paused
                  ? 'Paused'
                  : status.running
                  ? 'Building'
                  : 'Ready'}
              </span>
            </div>
          )}

          {/* Provider panel -- single source of truth for provider selection */}
          <ProviderPanel
            currentProvider={selectedProvider || status?.provider}
            isRunning={status?.running ?? false}
            onProviderChange={onProviderChange}
          />
        </div>
      </div>
    </header>
  );
}
