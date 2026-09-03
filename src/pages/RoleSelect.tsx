// ============================================================================
// AarogyaLink - Role Selection Screen (Pre-Login)
// ============================================================================

import { useNavigate } from 'react-router';

import { Button } from '@/components/ui/button';
import { Heart, Users, Stethoscope, Building2, Shield } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import type { Role } from '@/types';

const ROLES: { role: Role; icon: typeof Heart; label: string; description: string }[] = [
  { role: 'patient', icon: Users, label: 'Patient', description: 'Access healthcare, appointments, records and follow-up.' },
  { role: 'health_worker', icon: Stethoscope, label: 'Health Worker', description: 'Register patients, perform assisted triage and manage referrals.' },
  { role: 'doctor', icon: Stethoscope, label: 'Doctor', description: 'Manage consultations, patients, referrals and follow-ups.' },
  { role: 'hospital_admin', icon: Building2, label: 'Hospital Administrator', description: 'Manage incoming referrals, appointments, capacity and resources.' },
  { role: 'gov_admin', icon: Shield, label: 'District Administrator', description: 'Monitor healthcare access, referrals and district-level performance.' },
];

export default function RoleSelect() {
  const { setCurrentRole, currentRole } = useApp();
  const navigate = useNavigate();

  const handleSelect = (role: Role) => {
    setCurrentRole(role);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 sm:p-8">
      {/* Header */}
      <div className="text-center mb-10 max-w-lg">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-2xl bg-primary flex items-center justify-center">
            <Heart className="h-6 w-6 text-primary-foreground" fill="currentColor" />
          </div>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">AarogyaLink</h1>
        <p className="text-muted-foreground mt-3 text-base leading-relaxed">
          Connecting Rural Patients to the Right Care — Until Recovery.
        </p>
      </div>

      {/* Role question */}
      <div className="text-center mb-8">
        <h2 className="text-xl font-semibold text-foreground">How do you use AarogyaLink?</h2>
        <p className="text-sm text-muted-foreground mt-1">Select your role to continue</p>
      </div>

      {/* Role cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl w-full mb-8">
        {ROLES.map(({ role, icon: Icon, label, description }) => (
          <button
            key={role}
            onClick={() => handleSelect(role)}
            className={`text-left rounded-xl border-2 p-5 transition-all cursor-pointer ${
              currentRole === role
                ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-md'
                : 'border-border hover:border-primary/40 hover:bg-muted/30'
            }`}
          >
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-3 ${
              currentRole === role ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}>
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">{label}</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
          </button>
        ))}
      </div>

      {/* Continue button */}
      <Button
        size="lg"
        className="h-12 px-8 text-base"
        onClick={() => navigate('/auth')}
        disabled={!currentRole}
      >
        {currentRole === 'gov_admin' ? 'Continue to Dashboard' : 'Continue to Login'}
      </Button>

      {/* Footer */}
      <p className="text-xs text-muted-foreground mt-8 text-center max-w-md">
        AarogyaLink uses AI-assisted clinical decision support. All AI outputs require healthcare professional review and do not constitute autonomous medical diagnosis.
      </p>
    </div>
  );
}
