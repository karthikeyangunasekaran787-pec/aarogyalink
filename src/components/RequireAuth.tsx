// ============================================================================
// AarogyaLink - Protected Route Component with Role-Based Access Control
// ============================================================================

import { useLocation, Navigate, Link } from 'react-router';
import { useApp } from '@/contexts/AppContext';
import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RequireAuthProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

const ROLE_DASHBOARDS: Record<string, string> = {
  patient: '/patient/dashboard',
  health_worker: '/health-worker/dashboard',
  doctor: '/doctor/dashboard',
  hospital_admin: '/hospital-admin/dashboard',
  gov_admin: '/district-admin/dashboard',
};

export function RequireAuth({ children, allowedRoles }: RequireAuthProps) {
  const { isAuthenticated, currentUser } = useApp();
  const location = useLocation();

  // Not authenticated → redirect to role selection
  if (!isAuthenticated || !currentUser) {
    return <Navigate to="/role-select" state={{ from: location }} replace />;
  }

  // RBAC: validate the user's actual role against allowed roles
  // The role comes from the authenticated user record, NOT from UI state
  if (allowedRoles && allowedRoles.length > 0) {
    const userRole = currentUser.role;
    const isAuthorized = allowedRoles.includes(userRole);

    if (!isAuthorized) {
      // User is authenticated but trying to access a route for another role
      const redirectPath = ROLE_DASHBOARDS[userRole] || '/role-select';
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md text-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center mx-auto">
              <Shield className="h-8 w-8 text-red-500" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Access Restricted</h1>
            <p className="text-sm text-muted-foreground">
              Your account ({currentUser.name}) does not have permission to access this area.
              You are logged in as <strong className="capitalize">{userRole.replace(/_/g, ' ')}</strong>.
            </p>
            <Link to={redirectPath}>
              <Button className="mt-4">
                Go to {userRole.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} Dashboard
              </Button>
            </Link>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
}
