import type { PlanResult } from '../api/client';

interface PlanModalProps {
  plan: PlanResult | null;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PlanModal({ plan, loading, onConfirm, onCancel }: PlanModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="glass w-full max-w-lg mx-4 p-6 rounded-2xl shadow-glass">
        <h2 className="text-lg font-bold text-charcoal mb-4">Build Estimate</h2>

        {loading ? (
          <div className="flex flex-col items-center py-8 gap-3">
            <div className="w-8 h-8 border-2 border-accent-product border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate">Analyzing PRD...</p>
          </div>
        ) : plan ? (
          <>
            {plan.returncode !== 0 && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-warning/10 border border-warning/20 text-warning text-xs">
                loki plan exited with code {plan.returncode} - showing partial results
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="glass-subtle rounded-xl p-3">
                <div className="text-[10px] font-semibold text-slate uppercase tracking-wider mb-1">Complexity</div>
                <div className="text-base font-bold text-charcoal capitalize">{plan.complexity}</div>
              </div>
              <div className="glass-subtle rounded-xl p-3">
                <div className="text-[10px] font-semibold text-slate uppercase tracking-wider mb-1">Est. Cost</div>
                <div className="text-base font-bold text-charcoal">{plan.cost_estimate}</div>
              </div>
              <div className="glass-subtle rounded-xl p-3">
                <div className="text-[10px] font-semibold text-slate uppercase tracking-wider mb-1">Iterations</div>
                <div className="text-base font-bold text-charcoal">{plan.iterations}</div>
              </div>
              <div className="glass-subtle rounded-xl p-3">
                <div className="text-[10px] font-semibold text-slate uppercase tracking-wider mb-1">Phases</div>
                <div className="text-xs text-charcoal capitalize">{plan.phases.join(', ')}</div>
              </div>
            </div>

            {plan.output_text && (
              <details className="mb-4">
                <summary className="text-xs text-slate cursor-pointer hover:text-charcoal transition-colors">
                  Raw output
                </summary>
                <pre className="mt-2 text-[10px] font-mono text-slate bg-black/5 rounded-xl p-3 overflow-auto max-h-40 whitespace-pre-wrap">
                  {plan.output_text}
                </pre>
              </details>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-slate hover:text-charcoal transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-accent-product text-white hover:bg-accent-product/90 transition-all shadow-glass-subtle"
              >
                Start Build
              </button>
            </div>
          </>
        ) : (
          <div className="text-sm text-slate py-4">No plan data available.</div>
        )}
      </div>
    </div>
  );
}
