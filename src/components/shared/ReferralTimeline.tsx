// ============================================================================
// Referral Timeline - The signature visual component
// Shows the 8-step referral closure engine progress
// ============================================================================

import { cn } from '@/lib/utils';
import { Check, Clock, Circle, AlertTriangle } from 'lucide-react';
import type { ReferralStatus } from '@/types';

const STEPS: { status: ReferralStatus; label: string }[] = [
  { status: 'created', label: 'Created' },
  { status: 'accepted', label: 'Hospital Accepted' },
  { status: 'scheduled', label: 'Appointment Scheduled' },
  { status: 'patient_arrived', label: 'Patient Arrived' },
  { status: 'consultation', label: 'Consultation' },
  { status: 'treatment', label: 'Treatment' },
  { status: 'followup', label: 'Follow-up' },
  { status: 'closed', label: 'Referral Closed' },
];

const STATUS_ORDER: ReferralStatus[] = STEPS.map(s => s.status);

interface ReferralTimelineProps {
  currentStatus: ReferralStatus;
  currentStep: number;
  totalSteps: number;
  isOverdue?: boolean;
  compact?: boolean;
  showLabels?: boolean;
}

export function ReferralTimeline({
  currentStatus,
  currentStep,
  totalSteps,
  isOverdue = false,
  compact = false,
  showLabels = true,
}: ReferralTimelineProps) {
  const currentIdx = STATUS_ORDER.indexOf(currentStatus);

  return (
    <div className={cn('w-full', compact ? 'py-2' : 'py-4')}>
      {/* Progress summary */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {currentStep} of {totalSteps} steps completed
          </span>
          {isOverdue && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-xs font-medium">
              <AlertTriangle className="h-3 w-3" />
              Overdue
            </span>
          )}
        </div>
        <div className="text-sm font-medium text-primary">
          {Math.round((currentStep / totalSteps) * 100)}%
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-muted rounded-full mb-6 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-700 ease-out',
            isOverdue ? 'bg-red-500' : 'bg-primary'
          )}
          style={{ width: `${(currentStep / totalSteps) * 100}%` }}
        />
      </div>

      {/* Timeline steps */}
      <div className="relative">
        {STEPS.map((step, idx) => {
          const isCompleted = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          const isPending = idx > currentIdx;

          return (
            <div key={step.status} className="relative flex items-start gap-4 pb-4 last:pb-0">
              {/* Vertical line */}
              {idx < STEPS.length - 1 && (
                <div
                  className={cn(
                    'absolute left-[11px] top-6 w-0.5 h-full',
                    isCompleted ? 'bg-primary' : 'bg-border'
                  )}
                />
              )}

              {/* Step indicator */}
              <div className="relative z-10 flex-shrink-0">
                <div
                  className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center transition-all',
                    isCompleted && 'bg-primary text-primary-foreground',
                    isCurrent && !isOverdue && 'bg-primary/15 text-primary ring-2 ring-primary',
                    isCurrent && isOverdue && 'bg-red-50 text-red-600 ring-2 ring-red-400',
                    isPending && 'bg-muted text-muted-foreground border border-border'
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : isCurrent ? (
                    <Clock className="h-3.5 w-3.5" />
                  ) : (
                    <Circle className="h-3 w-3" />
                  )}
                </div>
              </div>

              {/* Step content */}
              <div className="flex-1 min-w-0 pt-0.5">
                <p
                  className={cn(
                    'text-sm font-medium',
                    isCompleted && 'text-foreground',
                    isCurrent && !isOverdue && 'text-primary font-semibold',
                    isCurrent && isOverdue && 'text-red-600 font-semibold',
                    isPending && 'text-muted-foreground'
                  )}
                >
                  {step.label}
                </p>
                {isCurrent && showLabels && (
                  <p className={cn(
                    'text-xs mt-0.5',
                    isOverdue ? 'text-red-500' : 'text-primary/70'
                  )}>
                    {isOverdue ? 'Action required' : 'In progress'}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Compact horizontal version for cards
export function ReferralProgressMini({
  currentStep,
  totalSteps,
  isOverdue,
}: {
  currentStep: number;
  totalSteps: number;
  isOverdue?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            isOverdue ? 'bg-red-500' : 'bg-primary'
          )}
          style={{ width: `${(currentStep / totalSteps) * 100}%` }}
        />
      </div>
      <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
        {currentStep}/{totalSteps}
      </span>
    </div>
  );
}
