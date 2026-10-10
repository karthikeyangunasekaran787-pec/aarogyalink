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
import {
  districtIdForCode,
  validateDistrictAdminDraft,
  validateDistrictDraft,
  districtAdmins as adminsForDistrict,
} from '@/lib/district-admin';

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
  // The district whose administrator form is open. An administrator can only be
  // created from a district's details, so this is always set while the form is
  // shown — the form cannot be opened without a district behind it.
  const [adminDistrictId, setAdminDistrictId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [openDistrict, setOpenDistrict] = useState<string | null>(null);

  const [districtForm, setDistrictForm] = useState({ name: '', code: '', headquarters: '' });
  const [adminForm, setAdminForm] = useState({ name: '', email: '', username: '', password: '' });
  const [createdAdmin, setCreatedAdmin] = useState<{ name: string; username: string; password: string; district: string } | null>(null);

  const districtAdmins = useMemo(() => staffUsers.filter(u => u.role === 'gov_admin'), [staffUsers]);
  /** The existing district the administrator form is bound to. */
  const adminDistrict = districts.find(d => d.districtId === adminDistrictId);

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

  // ── Create a district (step 1 of 2) ───────────────────────────
  // Creating a district stands alone: no administrator is created with it and
  // nothing else is implied. Only once the district exists can an
  // administrator be registered for it.
  const handleCreateDistrict = () => {
    setError('');
    const result = validateDistrictDraft(districtForm, districts);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const district = addDistrict(result.value);
    setDistrictForm({ name: '', code: '', headquarters: '' });
    setShowDistrictForm(false);
    flash(`${district.displayName} created. Open its details to assign a District Administrator.`);
  };

  // ── Create the district administrator (step 2 of 2) ───────────
  // Only reachable from a district's details, so the district always already
  // exists and the account is bound to its STORED district id — never to a name
  // typed into the form.
  const handleCreateAdmin = () => {
    setError('');
    const result = validateDistrictAdminDraft(adminForm, adminDistrict, staffUsers);
    if (!result.ok || !adminDistrict) {
      setError(result.ok ? 'Open a district and try again.' : result.error);
      return;
    }
    try {
      addStaffUser({
        name: adminForm.name.trim(),
        email: adminForm.email.trim(),
        role: 'gov_admin',
        username: adminForm.username.trim(),
        password: adminForm.password,
        districtId: adminDistrict.districtId,
        districtName: adminDistrict.name,
        status: 'active',
        createdBy: currentUser?.id || 'overall_admin',
      });
    } catch (err) {
      // The data layer re-checks the district binding and the one-admin rule;
      // surface its refusal instead of losing the message in an event handler.
      setError(err instanceof Error ? err.message : 'Could not create the District Administrator.');
      return;
    }
    setCreatedAdmin({
      name: adminForm.name.trim(),
      username: adminForm.username.trim(),
      password: adminForm.password,
      district: adminDistrict.displayName,
    });
    setAdminForm({ name: '', email: '', username: '', password: '' });
    setAdminDistrictId(null);
  };

  /** Open the administrator form for one EXISTING district. */
  const openAdminForm = (districtId: string) => {
    if (!districts.some(d => d.districtId === districtId)) return;
    setError('');
    setAdminForm({ name: '', email: '', username: '', password: '' });
    setAdminDistrictId(districtId);
  };

  /**
   * The inline create-administrator form, rendered INSIDE the details of the
   * district it belongs to. The district is already known here, so it is shown
   * for confirmation and never asked for again — the account is bound to the
   * district's stored id.
   */
  const districtAdminForm = (district: District) => (
    <div className="mt-2 space-y-3 rounded-lg border border-border px-4 py-4">
      <p className="text-sm font-medium text-foreground">
        New District Administrator for {district.displayName}{' '}
        <span className="text-muted-foreground">({district.districtId})</span>
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="admin-name">Full Name</label>
          <Input id="admin-name" value={adminForm.name} onChange={e => setAdminForm(f => ({ ...f, name: e.target.value }))} placeholder={`e.g. ${district.name} District Administrator`} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="admin-email">Email</label>
          <Input id="admin-email" type="email" value={adminForm.email} onChange={e => setAdminForm(f => ({ ...f, email: e.target.value }))} placeholder="distadmin@tn.gov.in" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="admin-username">Username</label>
          <Input
            id="admin-username"
            value={adminForm.username}
            onChange={e => setAdminForm(f => ({ ...f, username: e.target.value }))}
            placeholder={`e.g. distadmin_${district.districtId.replace('DIST-', '').toLowerCase()}`}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="admin-password">Password</label>
          <div className="flex gap-2">
            <Input id="admin-password" value={adminForm.password} onChange={e => setAdminForm(f => ({ ...f, password: e.target.value }))} placeholder="min 6 characters" />
            <Button
              type="button"
              variant="outline"
              aria-label="Generate password"
              onClick={() => setAdminForm(f => ({ ...f, password: generateTempPassword() }))}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        The account is bound to {district.districtId} and can only ever see and manage that one district — enforced by the backend.
      </p>
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleCreateAdmin}>Create District Admin</Button>
        <Button variant="outline" onClick={() => { setAdminDistrictId(null); setError(''); }}>Cancel</Button>
      </div>
    </div>
  );

  /**
   * The District Administrator section inside one district's details.
   *
   * This is the ONLY place an administrator can be created: with no account the
   * section offers the action (and hosts the inline form), and with one it shows
   * the account and the allowed management actions. A district keeps at most one
   * administrator.
   */
  const districtAdminPanel = (district: District) => {
    const admins = adminsForDistrict(staffUsers, district.districtId);

    if (admins.length === 0) {
      if (adminDistrictId === district.districtId) return districtAdminForm(district);
      return (
        <div className="mt-2 flex flex-col gap-3 rounded-lg border border-dashed border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">No District Administrator assigned yet.</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Create a district administrator to manage hospitals and healthcare operations in this district.
            </p>
          </div>
          <Button size="sm" onClick={() => openAdminForm(district.districtId)}>
            <UserPlus className="h-4 w-4 mr-1.5" /> Create District Admin
          </Button>
        </div>
      );
    }

    return (
      <div className="mt-2 space-y-2">
        {admins.map(admin => (
          <div key={admin.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{admin.name}</p>
                <Badge variant={admin.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                  {admin.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {admin.username} • {admin.email} • created {admin.createdAt}
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
                    {' '}({admin.username}) for {district.displayName}. They will no longer be able to sign in.
                    Hospitals, doctors, health workers and patients of the district are not affected — a replacement
                    administrator can be created here afterwards.
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
        ))}
      </div>
    );
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
          <Button size="sm" onClick={() => { setError(''); setDistrictForm({ name: '', code: '', headquarters: '' }); setShowDistrictForm(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> Create District
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
              Create District
              <button className="text-muted-foreground hover:text-foreground" onClick={() => setShowDistrictForm(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="district-name">District Name</label>
                <Input id="district-name" value={districtForm.name} onChange={e => setDistrictForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Karur" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="district-code">Short Code</label>
                <Input id="district-code" value={districtForm.code} onChange={e => setDistrictForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="e.g. KRR" maxLength={4} />
                <p className="text-[11px] text-muted-foreground">Becomes district id {districtIdForCode(districtForm.code || 'KRR')}</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="district-hq">Headquarters</label>
                <Input id="district-hq" value={districtForm.headquarters} onChange={e => setDistrictForm(f => ({ ...f, headquarters: e.target.value }))} placeholder="e.g. Karur" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              A district is created on its own. Its District Administrator is assigned afterwards, from the district&rsquo;s details.
            </p>
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                <AlertCircle className="h-4 w-4" /> {error}
              </div>
            )}
            <Button onClick={handleCreateDistrict}>Create District</Button>
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
              <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> District Management</span>
              <Button size="sm" onClick={() => { setError(''); setDistrictForm({ name: '', code: '', headquarters: '' }); setShowDistrictForm(true); }}>
                <Plus className="h-4 w-4 mr-1.5" /> Create District
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Every district on the platform. Open a district to review its details and assign its District Administrator.
            </p>
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
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setOpenDistrict(open => (open === district.districtId ? null : district.districtId))}
                    >
                      {openDistrict === district.districtId ? 'Hide Details' : 'View Details'}
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
                  <div className="mt-4 space-y-4 border-t border-border pt-4">
                    {/* A · District information */}
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        District information
                      </p>
                      <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {[
                          { label: 'District name', value: district.name },
                          { label: 'District code', value: district.districtId },
                          { label: 'State', value: district.state },
                          { label: 'Headquarters', value: district.headquarters || district.name },
                          { label: 'Created', value: district.createdAt },
                        ].map(row => (
                          <div key={row.label} className="rounded-lg bg-muted/40 px-3 py-2">
                            <dt className="text-[11px] text-muted-foreground">{row.label}</dt>
                            <dd className="text-sm font-medium text-foreground break-words">{row.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>

                    {/* B · District Administrator — bound to THIS district's id */}
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        District Administrator
                      </p>
                      {districtAdminPanel(district)}
                    </div>

                    {/* C · The district's hospitals */}
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Hospitals in this district
                      </p>
                      <div className="mt-2 space-y-2">
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
                    </div>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── District administrators (read-only overview) ───────── */}
      {(view === 'dashboard' || view === 'admins') && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" /> District Administrators
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              One administrator per district. Create or remove an administrator from its district&rsquo;s details in
              District Management — an account is permanently bound to that one district.
            </p>
            {districtAdmins.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm font-medium text-foreground">No District Administrators yet.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Open a district in District Management and assign one.
                </p>
              </div>
            ) : districtAdmins.map(admin => (
              <div key={admin.id} className="rounded-xl border border-border p-4">
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

      {/* ── Initial System Data ──────────────────────────────── */}
      {view === 'dashboard' && (
        <Card>
          <CardContent className="p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Initial System Data</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Reload the initial system records (Pudukkottai and Tiruchirappalli hospitals, staff, patients and referrals) across every device.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => { resetDemoData(); flash('Initial system data restored and syncing to every device.'); }}>
              <RefreshCw className="h-4 w-4 mr-1.5" /> Restore initial data
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
