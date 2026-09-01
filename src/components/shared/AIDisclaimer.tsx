// ============================================================================
// AI Disclaimer - Clinical Decision Support notice
// ============================================================================

import { cn } from '@/lib/utils';
import { Info } from 'lucide-react';

export function AIDisclaimer({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-800',
        className
      )}
    >
      <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-600" />
      <p className="text-xs leading-relaxed">
        <span className="font-semibold">Clinical Decision Support:</span>{' '}
        AI-generated results are for informational purposes only and require
        healthcare professional review. This is not an autonomous medical diagnosis.
      </p>
    </div>
  );
}

export function AIInsightCard({
  title,
  content,
  confidence,
}: {
  title: string;
  content: string;
  confidence?: number;
}) {
  return (
    <div className="rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50/50 to-transparent p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center">
          <span className="text-xs">🤖</span>
        </div>
        <h4 className="text-sm font-semibold text-blue-900">{title}</h4>
        {confidence !== undefined && (
          <span className="ml-auto text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
            {confidence}% confidence
          </span>
        )}
      </div>
      <p className="text-sm text-blue-800 leading-relaxed">{content}</p>
    </div>
  );
}
