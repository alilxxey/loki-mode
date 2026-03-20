import { useEffect, useState } from 'react';
import { api } from '../api/client';

interface CostTrackerProps {
  className?: string;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

function getCostColor(cost: number): string {
  if (cost > 5) return 'text-danger';
  if (cost >= 1) return 'text-warning';
  return 'text-success';
}

export function CostTracker({ className = '' }: CostTrackerProps) {
  const [cost, setCost] = useState<number>(0);
  const [tokens, setTokens] = useState<number>(0);

  useEffect(() => {
    let mounted = true;

    const fetchMetrics = async () => {
      try {
        const metrics = await api.getMetrics();
        if (!mounted) return;
        // Extract cost from metrics -- tokens_used is always present
        const tokensUsed = metrics.tokens_used ?? 0;
        setTokens(tokensUsed);
        // Estimate cost at ~$0.003 per 1K tokens if no explicit cost field
        const estimatedCost = (metrics as Record<string, unknown>).cost as number | undefined;
        setCost(estimatedCost ?? tokensUsed * 0.000003);
      } catch {
        // metrics endpoint may not be available
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30_000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <span className={`text-xs font-mono ${getCostColor(cost)} ${className}`}>
      ${cost.toFixed(2)} | {formatTokens(tokens)} tokens
    </span>
  );
}
