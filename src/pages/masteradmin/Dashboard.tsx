// ============================================================================
// AarogyaLink — Overall Administration (master console)
// ----------------------------------------------------------------------------
// The Overall Administrator is the platform owner: the only account that can
// create districts and District Administrators, and the only one that sees
// every district. All privileged operations are authorized by the BACKEND
// (see src/convex/authz.ts + appSession.ts) from the server-side binding, so
// nothing on this page can grant access the backend has not verified.
// ============================================================================

import { useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { useApp } from '@/contexts/AppContext';
import { useData, generateTempPassword } from '@/contexts/DataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import {
  Building2, Users, Stethoscope, UserPlus, Plus, MapPin, ShieldCheck,
  FileText, CheckCircle2, AlertCircle, Copy, Check, Power, PowerOff,
  RefreshCw, X, Trash2,
} from 'lucide-react';
import type { District } from '@/types';

type DistrictStats = {
  district: District;
  hospitals: number;
  doctors: number;
  healthWorkers: number;
  patients: number;
  activeReferrals: number;
  closedReferrals: number;
};

export default function MasterAdminDashboard() {
  const { currentUser } = useApp();
  const {
    districts, hospitals, doctors, healthWorkers, patients, referrals,
    staffUsers, addDistrict, addStaffUser, removeStaffUser,
    toggleHospitalStatus, resetDemoData, getHospitalsForDistrict,
  } = useData();

  const location = useLocation();
  const view = location.pathname.split('/')[2] || 'dashboard';

  const [showDistrictForm, setShowDistrictForm] = useState(false);
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [openDistrict, setOpenDistrict] = useState<string | null>(null);

  const [districtForm, setDistrictForm] = useState({ name: '', code: '', headquarters: '' });
  const [adminForm, setAdminForm] = useState({ name: '', email: '', username: '', password: '', districtId: '' });
  const [createdAdmin, setCreatedAdmin] = useState<{ name: string; username: string; password: string; district: string } | null>(null);

  const districtAdmins = useMemo(() => staffUsers.filter(u => u.role === 'gov_admin'), [staffUsers]);
  const selectedAdminDistrict = districts.find(d => d.districtId === adminForm.districtId);

  /** Per-district rollup, computed from the live collections. */
  const districtStats = useMemo<DistrictStats[]>(() => {
    return districts.map(district => {
      const distHospitals = getHospitalsForDistrict(district.districtId);
      const facilityIds = new Set(distHospitals.map(h => h.id));
      const distPatients = patients.filter(p => p.registeredByFacilityId && facilityIds.has(p.registeredByFacilityId));
      const distReferrals = referrals.filter(
        r => facilityIds.has(r.sourceFacilityId) || facilityIds.has(r.destinationFacilityId),
      );
      return {
        district,
        hospitals: distHospitals.length,
        doctors: doctors.filter(d => facilityIds.has(d.facilityId)).length,
        healthWorkers: healthWorkers.filter(hw => facilityIds.has(hw.facilityId)).length,
        patients: distPatients.length,
        activeReferrals: distReferrals.filter(r => r.status !== 'closed').length,
        closedReferrals: distReferrals.filter(r => r.status === 'closed').length,
      };
    });
  }, [districts, getHospitalsForDistrict, patients, referrals, doctors, healthWorkers]);

  const districtName = (districtId?: string) =>
    districts.find(d => d.districtId === districtId)?.name || '—';

  const copy = (text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    }).catch(() => {});
  };

  const flash = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 5000);
  };

  // ── Create a district and its administrator in one step ───────
  // A district is useless without its own administrator (and only the Overall
  // Administrator may mint one), so both are created together. A district
  // administrator is bound to exactly one district for life; that binding is
  // what the backend uses to keep districts from mixing.
  const handleCreateDistrictWithAdmin = () => {
    setError('');
    const { name, code, headquarters } = districtForm;
    const admin = adminForm;
    if (!name.trim() || !code.trim()) {
      setError('District name and a short code (e.g. TRY) are required.');
      return;
    }
    if (!/^[A-Za-z]{2,4}$/.test(code.trim())) {
      setError('The district code must be 2–4 letters (it becomes DIST-<code>).');
      return;
    }
    const districtId = `DIST-${code.trim().toUpperCase()}`;
    if (districts.some(d => d.districtId === districtId)) {
      setError(`District ${districtId} already exists.`);
      return;
    }
    if (!admin.name.trim() || !admin.email.trim() || !admin.username.trim() || !admin.password) {
      setError('The District Administrator name, email, username and password are all required.');
      return;
    }
    if (!admin.email.includes('@')) {
      setError('Enter a valid email address for the District Administrator.');
      return;
    }
    if (admin.password.length < 6) {
      setError('The password must be at least 6 characters.');
      return;
    }
    if (staffUsers.some(u => u.username?.toLowerCase() === admin.username.trim().toLowerCase())) {
      setError(`Username "${admin.username.trim()}" is already taken.`);
      return;
    }
    const district = addDistrict({ name, code, headquarters });
    addStaffUser({
      name: admin.name.trim(),
      email: admin.email.trim(),
      role: 'gov_admin',
      username: admin.username.trim(),
      password: admin.password,
      districtId: district.districtId,
      districtName: district.name,
      status: 'active',
      createdBy: currentUser?.id || 'overall_admin',
    });
    setCreatedAdmin({
      name: admin.name.trim(),
      username: admin.username.trim(),
      password: admin.password,
      district: district.displayName,
    });
    setDistrictForm({ name: '', code: '', headquarters: '' });
    setAdminForm({ name: '', email: '', username: '', password: '', districtId: '' });
    setShowDistrictForm(false);
  };

  // ── Create district administrator ─────────────────────────────
  // Registration ALWAYS asks for the district details: either the form is
  // opened from a district card (details prefilled and locked) or the
  // Overall Administrator fills in the district this account will manage.
  const handleCreateAdmin = () => {
    setError('');
    const { name, email, username, password, districtId } = adminForm;
    const dName = districtForm.name;
    const code = districtForm.code;
    // 1 · District details are required.
    if (!dName.trim() || !code.trim()) {
      setError('District name and short code are required — the administrator is registered FOR that district.');
      return;
    }
    if (!/^[A-Za-z]{2,4}$/.test(code.trim())) {
      setError('The district code must be 2–4 letters (it becomes DIST-<code>).');
      return;
    }
    const district = districts.find(d => d.districtId === `DIST-${code.trim().toUpperCase()}`);
    if (!district) {
      setError(`District DIST-${code.trim().toUpperCase()} does not exist. Create it first.`);
      return;
    }
    if (district.districtId !== districtId && districtId) {
      setError('The selected district does not match the district details entered.');
      return;
    }
    // 2 · Administrator details are required.
    if (!name.trim() || !email.trim() || !username.trim() || !password) {
      setError('All administrator fields are required.');
      return;
    }
    if (!email.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('The password must be at least 6 characters.');
      return;
    }
    if (staffUsers.some(u => u.username?.toLowerCase() === username.trim().toLowerCase())) {
      setError(`Username "${username.trim()}" is already taken.`);
      return;
    }
    addStaffUser({
      name: name.trim(),
      email: email.trim(),
      role: 'gov_admin',
      username: username.trim(),
      password,
      districtId: district.districtId,
      districtName: district.name,
      status: 'active',
      createdBy: currentUser?.id || 'overall_admin',
    });
    setCreatedAdmin({ name: name.trim(), username: username.trim(), password, district: district.displayName });
    setDistrictForm({ name: '', code: '', headquarters: '' });
    setAdminForm({ name: '', email: '', username: '', password: '', districtId: '' });
    setShowAdminForm(false);
  };

  const openAdminForm = (districtId?: string) => {
    setError('');
    if (districtId) {
      const district = districts.find(d => d.districtId === districtId);
      if (district) {
        // Registering for a specific district: its details are already known,
        // so only the administrator half of the form is editable.
        setDistrictForm({ name: district.name, code: district.districtId.replace('DIST-', ''), headquarters: district.headquarters || '' });
        setAdminForm({ name: '', email: '', username: '', password: '', districtId });
        setShowAdminForm(true);
        return;
      }
    }
    setDistrictForm({ name: '', code: '', headquarters: '' });
    setAdminForm({ name: '', email: '', username: '', password: '', districtId: '' });
    setShowAdminForm(true);
  };

  // ── District admin lifecycle ──────────────────────────────────
  // The Overall Administrator may only REGISTER and DELETE District
  // Administrators. Editing, disabling and password resets are deliberately
  // not offered: a mistake is corrected by deleting the account and
  // registering a fresh one for the same district, which keeps the
  // credentials story simple and auditable.

  const totals = {
    hospitals: hospitals.length,
    doctors: doctors.length,
    healthWorkers: healthWorkers.length,
    patients: patients.length,
    referrals: referrals.length,
    active: referrals.filter(r => r.status !== 'closed').length,
  };

  const kpis = [
    { label: 'Districts', value: districts.length, icon: MapPin, tone: 'bg-indigo-50 text-indigo-600' },
    { label: 'Hospitals', value: totals.hospitals, icon: Building2, tone: 'bg-blue-50 text-blue-600' },
    { label: 'Doctors', value: totals.doctors, icon: Stethoscope, tone: 'bg-emerald-50 text-emerald-600' },
    { label: 'Health Workers', value: totals.healthWorkers, icon: Users, tone: 'bg-teal-50 text-teal-600' },
    { label: 'Patients', value: totals.patients, icon: UserPlus, tone: 'bg-amber-50 text-amber-600' },
    { label: 'Referrals', value: `${totals.active} active`, icon: FileText, tone: 'bg-rose-50 text-rose-600' },
  ];

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Overall Administration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {districts.length} Districts • {totals.hospitals} Hospitals • {totals.patients} Registered Patients • Platform-wide view
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => { setError(''); setShowDistrictForm(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> Create District + Administrator
          </Button>
        </div>
      </div>

      {notice && (
        <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> {notice}
        </div>
      )}

      {/* ── KPI cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map(kpi => (
          <Card key={kpi.label} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-3 ${kpi.tone}`}>
                <kpi.icon className="h-5 w-5" />
              </div>
              <p className="text-xl font-bold text-foreground">{kpi.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Create district form ───────────────────────────────── */}
      {showDistrictForm && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              Create District + District Administrator
              <button className="text-muted-foreground hover:text-foreground" onClick={() => setShowDistrictForm(false)}>
                <X className="h-4 w-4" />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">1 · District</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">District Name</label>
                <Input value={districtForm.name} onChange={e => setDistrictForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Karur" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Short Code</label>
                <Input value={districtForm.code} onChange={e => setDistrictForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="e.g. KRR" maxLength={4} />
                <p className="text-[11px] text-muted-foreground">Becomes district id DIST-{districtForm.code || 'KRR'}</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Headquarters</label>
                <Input value={districtForm.headquarters} onChange={e => setDistrictForm(f => ({ ...f, headquarters: e.target.value }))} placeholder="e.g. Karur" />
              </div>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              2 · District Administrator (bound to this district only)
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Full Name</label>
                <Input value={adminForm.name} onChange={e => setAdminForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Karur District Administrator" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input type="email" value={adminForm.email} onChange={e => setAdminForm(f => ({ ...f, email: e.target.value }))} placeholder="distadmin@tn.gov.in" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Username</label>
                <Input
                  value={adminForm.username}
                  onChange={e => setAdminForm(f => ({ ...f, username: e.target.value }))}
                  placeholder={`e.g. distadmin_${(districtForm.code || 'krr').toLowerCase()}`}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Password</label>
                <div className="flex gap-2">
                  <Input value={adminForm.password} onChange={e => setAdminForm(f => ({ ...f, password: e.target.value }))} placeholder="min 6 characters" />
                  <Button type="button" variant="outline" onClick={() => setAdminForm(f => ({ ...f, password: generateTempPassword() }))}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              This administrator is created together with {districtForm.code ? `DIST-${districtForm.code.toUpperCase()}` : 'the new district'} and can only ever see and edit that one district — enforced by the backend.
            </p>
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                <AlertCircle className="h-4 w-4" /> {error}
              </div>
            )}
            <Button onClick={handleCreateDistrictWithAdmin}>Create District + Administrator</Button>
          </CardContent>
        </Card>
      )}

      {/* ── Create district administrator form ─────────────────── */}
      {showAdminForm && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              Create District Administrator
              <button className="text-muted-foreground hover:text-foreground" onClick={() => setShowAdminForm(false)}>
                <X className="h-4 w-4" />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* 1 · District details — required for every registration */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                1 · District {adminForm.districtId ? '(selected district — locked)' : 'details (required)'}
              </p>
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">District Name</label>
                  <Input
                    value={districtForm.name}
                    onChange={e => setDistrictForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Pudukkottai"
                    disabled={!!adminForm.districtId}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Short Code</label>
                  <Input
                    value={districtForm.code}
                    onChange={e => setDistrictForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                    placeholder="e.g. PDK"
                    maxLength={4}
                    disabled={!!adminForm.districtId}
                  />
                  <p className="text-[11px] text-muted-foreground">District id DIST-{districtForm.code || 'PDK'}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Headquarters</label>
                  <Input
                    value={districtForm.headquarters}
                    onChange={e => setDistrictForm(f => ({ ...f, headquarters: e.target.value }))}
                    placeholder="e.g. Pudukkottai"
                    disabled={!!adminForm.districtId}
                  />
                </div>
              </div>
              {!adminForm.districtId && selectedAdminDistrict && (
                <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  Registering for <span className="font-medium">{selectedAdminDistrict.displayName}</span> ({selectedAdminDistrict.districtId}).
                </p>
              )}
              {!adminForm.districtId && !selectedAdminDistrict && districtForm.name.trim() && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  No district "DIST-{districtForm.code || '…'}" exists yet — create it with “Create District + Administrator” first.
                </p>
              )}
            </div>
            {/* 2 · Administrator details */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                2 · District Administrator (bound to this district only)
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Full Name</label>
                  <Input value={adminForm.name} onChange={e => setAdminForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Pudukkottai District Administrator" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <Input type="email" value={adminForm.email} onChange={e => setAdminForm(f => ({ ...f, email: e.target.value }))} placeholder="distadmin@tn.gov.in" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Username</label>
                  <Input
                    value={adminForm.username}
                    onChange={e => setAdminForm(f => ({ ...f, username: e.target.value }))}
                    placeholder={`e.g. distadmin_${(districtForm.code || 'pdk').toLowerCase()}`}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Password</label>
                  <div className="flex gap-2">
                    <Input value={adminForm.password} onChange={e => setAdminForm(f => ({ ...f, password: e.target.value }))} placeholder="min 6 characters" />
                    <Button type="button" variant="outline" onClick={() => setAdminForm(f => ({ ...f, password: generateTempPassword() }))}>
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                This administrator can only ever see and manage their own district — enforced by the backend.
              </p>
            </div>
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                <AlertCircle className="h-4 w-4" /> {error}
              </div>
            )}
            <Button onClick={handleCreateAdmin}>Register District Administrator</Button>
          </CardContent>
        </Card>
      )}

      {/* ── Credential confirmation ────────────────────────────── */}
      {createdAdmin && (
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <p className="font-semibold text-foreground">District Administrator created</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              {[
                { label: 'Name', value: createdAdmin.name },
                { label: 'District', value: createdAdmin.district },
                { label: 'Username', value: createdAdmin.username, copyKey: 'u' },
                { label: 'Password', value: createdAdmin.password, copyKey: 'p' },
              ].map(row => (
                <div key={row.label} className="bg-white rounded-lg border border-border p-3">
                  <p className="text-[11px] text-muted-foreground">{row.label}</p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-foreground break-all">{row.value}</p>
                    {row.copyKey && (
                      <button className="text-muted-foreground hover:text-foreground" onClick={() => copy(row.value, row.copyKey!)}>
                        {copied === row.copyKey ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              These credentials sign in through the District Administrator login and are verified by the backend against the stored record.
            </p>
            <Button variant="outline" size="sm" onClick={() => setCreatedAdmin(null)}>Done</Button>
          </CardContent>
        </Card>
      )}

      {/* ── Districts ──────────────────────────────────────────── */}
      {(view === 'dashboard' || view === 'districts') && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Districts</span>
              <Button size="sm" variant="outline" onClick={() => { setError(''); setShowDistrictForm(true); }}>
                <Plus className="h-4 w-4 mr-1.5" /> Create District + Administrator
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {districtStats.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No districts yet. Create the first one to begin.</p>
            ) : districtStats.map(({ district, hospitals: hCount, doctors: dCount, healthWorkers: hwCount, patients: pCount, activeReferrals, closedReferrals }) => (
              <div key={district.districtId} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{district.displayName}</h3>
                      <Badge variant="outline" className="text-[10px]">{district.districtId}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {district.headquarters ? `${district.headquarters} • ` : ''}{district.state}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => openAdminForm(district.districtId)}>
                      <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Register District Admin
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setOpenDistrict(open => (open === district.districtId ? null : district.districtId))}
                    >
                      {openDistrict === district.districtId ? 'Hide details' : 'View details'}
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-3">
                  {[
                    { label: 'Hospitals', value: hCount },
                    { label: 'Doctors', value: dCount },
                    { label: 'Health Workers', value: hwCount },
                    { label: 'Patients', value: pCount },
                    { label: 'Active Referrals', value: activeReferrals },
                    { label: 'Closed Referrals', value: closedReferrals },
                  ].map(stat => (
                    <div key={stat.label} className="rounded-lg bg-muted/40 px-3 py-2">
                      <p className="text-base font-semibold text-foreground">{stat.value}</p>
                      <p className="text-[11px] text-muted-foreground">{stat.label}</p>
                    </div>
                  ))}
                </div>
                {openDistrict === district.districtId && (
                  <div className="mt-3 space-y-2 border-t border-border pt-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      District administration view (read-only)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Administrators:{' '}
                      {districtAdmins.filter(a => a.districtId === district.districtId).map(a => a.name).join(', ') || 'none yet'}
                    </p>
                    {getHospitalsForDistrict(district.districtId).map(h => (
                      <div key={h.id} className="rounded-lg border border-border/70 px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-foreground">{h.name}</span>
                          <span className="text-muted-foreground">
                            {h.hospitalId} • {h.status} • {h.totalBeds} beds
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Hospital admin: {h.adminUsername || 'not assigned'} •{' '}
                          Doctors: {doctors.filter(d => d.facilityId === h.id).length} •{' '}
                          Health workers: {healthWorkers.filter(hw => hw.facilityId === h.id).length} •{' '}
                          Patients: {patients.filter(p => p.registeredByFacilityId === h.id).length}
                        </p>
                      </div>
                    ))}
                    {hCount === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No hospitals registered in this district yet — its District Administrator can create them from the district console.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── District administrators (register + delete only) ──── */}
      {(view === 'dashboard' || view === 'admins') && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> District Administrators</span>
              <Button size="sm" variant="outline" onClick={() => openAdminForm()}>
                <Plus className="h-4 w-4 mr-1.5" /> Register
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              District Administrators can be registered and deleted here. Registration asks for the district the
              administrator will manage; an account is permanently bound to that one district and can never see
              or edit another district's data.
            </p>
            {districtAdmins.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No District Administrators yet.</p>
            ) : districtAdmins.map(admin => (
              <div key={admin.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{admin.name}</h3>
                      <Badge variant={admin.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                        {admin.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {admin.username} • {admin.email} • {districtName(admin.districtId)}
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700">
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete District Administrator?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This permanently removes <span className="font-medium">{admin.name}</span>
                          {' '}({admin.username}) for {districtName(admin.districtId)}. They will no longer be able to
                          sign in. Hospitals, doctors, health workers and patients of the district are not affected —
                          register a new administrator afterwards to manage them.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-600 text-white hover:bg-red-700"
                          onClick={() => { removeStaffUser(admin.id); flash(`${admin.name} deleted.`); }}
                        >
                          Delete administrator
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── All hospitals ────────────────────────────────────── */}
      {view === 'dashboard' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" /> All Hospitals
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {hospitals.map(h => (
              <div key={h.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{h.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {h.hospitalId} • {districtName(h.districtId)} • {h.totalBeds} beds • {h.adminUsername || 'no admin'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={h.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">{h.status}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => toggleHospitalStatus(h.id)}>
                    {h.status === 'active' ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Demo data ────────────────────────────────────────── */}
      {view === 'dashboard' && (
        <Card>
          <CardContent className="p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Demo dataset</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Restore the original prototype fixtures (Pudukkottai + Tiruchirappalli hospitals, staff, patients and referrals) across every device.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => { resetDemoData(); flash('Demo data restored and syncing to every device.'); }}>
              <RefreshCw className="h-4 w-4 mr-1.5" /> Restore Demo Data
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
