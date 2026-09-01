// ============================================================================
// Offline Indicator - Shows offline mode status
// ============================================================================

import { Wifi, WifiOff, CloudOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export function OfflineIndicator({ isOffline }: { isOffline: boolean }) {
  if (!isOffline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 text-white text-sm font-medium">
      <WifiOff className="h-4 w-4" />
      <span>Offline Mode — Data will sync when connection is restored</span>
    </div>
  );
}

export function SyncStatus({ pendingItems, lastSynced }: { pendingItems: number; lastSynced: string }) {
  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium',
      pendingItems > 0
        ? 'bg-amber-50 text-amber-700 border border-amber-200'
        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
    )}>
      {pendingItems > 0 ? (
        <>
          <CloudOff className="h-3.5 w-3.5" />
          <span>{pendingItems} items pending sync</span>
        </>
      ) : (
        <>
          <Wifi className="h-3.5 w-3.5" />
          <span>Synced {lastSynced}</span>
        </>
      )}
    </div>
  );
}
