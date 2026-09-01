// ============================================================================
// AarogyaLink - Protected Route Component with Role-Based Access
// ============================================================================

import { useLocation, Navigate } from 'react-router';
import { useConvexAuth } from 'convex/react';
import { Button } from '@/components/ui/button';
import { Shield } from 'lucide-react';

interface RequireAuthProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export function RequireAuth({ children }: RequireAuthProps) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const location = useLocation();

  // Show loading while auth state is resolving
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-sm text-muted-foreground">Verifying access...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/role-select" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
