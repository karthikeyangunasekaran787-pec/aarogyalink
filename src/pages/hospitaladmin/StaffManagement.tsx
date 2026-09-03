// ============================================================================
// Hospital Admin — Staff Management
// Hospital Admin creates and manages Doctor and Health Worker accounts
// ============================================================================

import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Users, Stethoscope, Heart, Plus, Search, Edit2, UserX, UserCheck, Trash2,
  CheckCircle2, AlertCircle, X
} from 'lucide-react';
import type { User, Role } from '@/types';

type StaffForm = {
  name: string;
  username: string;
  email: string;
  phone: string;
  department: string;
  specialization: string;
  facilityId: string;
  area: string;
  designation: string;
  role: 'doctor' | 'health_worker';
};

const INITIAL_FORM: StaffForm = {
  name: '', username: '', email: '', phone: '',
  department: '', specialization: '', facilityId: 'f3',
  area: '', designation: '', role: 'doctor',
};

const DEPARTMENTS = ['General Medicine', 'Cardiology', 'Orthopedics', 'Pediatrics', 'OBG', 'ENT', 'Neurology', 'Surgery'];

export default function StaffManagement() {
  const { language, currentUser } = useApp();
  const { staffUsers, facilities, hospitals, addStaffUser, disableStaffUser, enableStaffUser, removeStaffUser, getStaffByFacility } = useData();

  const hospitalFacilityId = currentUser?.facilityId || 'f3';
  // Look up hospital from both facilities and newly registered hospitals
  const facility = facilities.find(f => f.id === hospitalFacilityId)
    || hospitals.find(h => h.id === hospitalFacilityId);
  const facilityStaff = staffUsers.filter(u => u.facilityId === hospitalFacilityId && u.role !== 'hospital_admin' && u.role !== 'gov_admin' && u.role !== 'patient');
  const facilityDoctors = facilityStaff.filter(u => u.role === 'doctor');
  const facilityHWs = facilityStaff.filter(u => u.role === 'health_worker');

  const [activeTab, setActiveTab] = useState<'doctors' | 'health_workers'>('doctors');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<StaffForm>(INITIAL_FORM);
  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3000);
  };

  const filteredStaff = (activeTab === 'doctors' ? facilityDoctors : facilityHWs).filter(u => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return u.name.toLowerCase().includes(q) || (u.username ?? '').toLowerCase().includes(q);
  });

  const handleCreate = () => {
    if (!form.name || !form.username || !form.email) {
      showFeedback('Please fill in name, username, and email.');
      return;
    }

    // Check username uniqueness
    if (staffUsers.some(u => u.username === form.username)) {
      showFeedback('Username already exists. Please choose a different one.');
      return;
    }

    const role: Role = form.role;
    const newStaff = addStaffUser({
      name: form.name,
      username: form.username,
      email: form.email,
      phone: form.phone,
      role,
      facilityId: form.facilityId || hospitalFacilityId,
      departmentId: form.department || undefined,
      status: 'active',
      createdBy: currentUser?.id,
    });

    // Also add to doctors or healthWorkers list for dashboard compatibility
    if (role === 'doctor') {
      // Doctor is created in staffUsers, accessible via DataContext
    }

    setForm(INITIAL_FORM);
    setShowForm(false);
    showFeedback(`✅ ${role === 'doctor' ? 'Doctor' : 'Health Worker'} account created: ${newStaff.name} (${newStaff.username})`);
  };

  const handleToggleStatus = (userId: string, currentStatus: string) => {
    if (currentStatus === 'active') {
      disableStaffUser(userId);
      showFeedback('Staff account disabled');
    } else {
      enableStaffUser(userId);
      showFeedback('Staff account enabled');
    }
  };

  const StaffCard = ({ user }: { user: User }) => (
    <Card key={user.id} className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
              user.role === 'doctor' ? 'bg-blue-50' : 'bg-emerald-50'
            }`}>
              {user.role === 'doctor'
                ? <Stethoscope className="h-5 w-5 text-blue-600" />
                : <Heart className="h-5 w-5 text-emerald-600" />
              }
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{user.name}</p>
              <p className="text-xs text-muted-foreground">@{user.username}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{user.email}</p>
              {user.role === 'doctor' && (
                <p className="text-xs text-muted-foreground">Department: {user.departmentId || 'General Medicine'}</p>
              )}
              {user.role === 'health_worker' && (
                <p className="text-xs text-muted-foreground">Area: {user.facilityId ? facility?.name || user.facilityId : 'Unassigned'}</p>
              )}
              {user.lastLogin && (
                <p className="text-[10px] text-muted-foreground mt-1">Last login: {user.lastLogin}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge className={`text-[10px] ${
              user.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
              user.status === 'disabled' ? 'bg-red-50 text-red-700 border-red-200' :
              'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {user.status === 'active' ? 'Active' : user.status === 'disabled' ? 'Disabled' : 'Pending'}
            </Badge>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => handleToggleStatus(user.id, user.status)}
              >
                {user.status === 'active' ? (
                  <><UserX className="h-3 w-3 mr-1" /> Disable</>
                ) : (
                  <><UserCheck className="h-3 w-3 mr-1" /> Enable</>
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => setConfirmDelete(user.id)}
              >
                <Trash2 className="h-3 w-3 mr-1" /> Remove
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Feedback Toast */}
      {feedback && (
        <div className="fixed top-20 right-6 z-50 bg-white border border-border rounded-xl shadow-lg px-4 py-3 text-sm font-medium text-foreground animate-in fade-in slide-in-from-top-2">
          {feedback}
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Staff Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage doctors and health workers at {facility?.name || 'your facility'}
          </p>
        </div>
        <Button className="gap-1.5" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> Add {activeTab === 'doctors' ? 'Doctor' : 'Health Worker'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setActiveTab('doctors')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Stethoscope className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{facilityDoctors.length}</p>
              <p className="text-xs text-muted-foreground">Doctors</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setActiveTab('health_workers')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Heart className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{facilityHWs.length}</p>
              <p className="text-xs text-muted-foreground">Health Workers</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create Staff Form */}
      {showForm && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-primary" />
                Add New {activeTab === 'doctors' ? 'Doctor' : 'Health Worker'}
              </span>
              <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setForm(INITIAL_FORM); }}>✕</Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Full Name *</label>
                <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder={activeTab === 'doctors' ? 'Dr. Arun Kumar' : 'Priya'} className="h-10" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Username *</label>
                <Input value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} placeholder={activeTab === 'doctors' ? 'arun.cardiology' : 'priya.hw01'} className="h-10" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Email *</label>
                <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="doctor@hospital.in" className="h-10" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Phone</label>
                <Input type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="9840100099" className="h-10" />
              </div>
              {activeTab === 'doctors' && (
                <>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Department</label>
                    <select value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">Select department...</option>
                      {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Specialization</label>
                    <Input value={form.specialization} onChange={e => setForm(p => ({ ...p, specialization: e.target.value }))} placeholder="e.g. Cardiologist" className="h-10" />
                  </div>
                </>
              )}
              {activeTab === 'health_workers' && (
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Assigned Area/Village</label>
                  <Input value={form.area} onChange={e => setForm(p => ({ ...p, area: e.target.value }))} placeholder="e.g. Kallikudi" className="h-10" />
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <Button onClick={handleCreate} disabled={!form.name || !form.username || !form.email} className="gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> Create Account
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setForm(INITIAL_FORM); }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        <Button variant={activeTab === 'doctors' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('doctors')}>
          Doctors ({facilityDoctors.length})
        </Button>
        <Button variant={activeTab === 'health_workers' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('health_workers')}>
          Health Workers ({facilityHWs.length})
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search by name or username..." className="pl-9" />
      </div>

      {/* Staff List */}
      <div className="space-y-3">
        {filteredStaff.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No {activeTab === 'doctors' ? 'doctors' : 'health workers'} found</CardContent></Card>
        ) : filteredStaff.map(user => <StaffCard key={user.id} user={user} />)}
      </div>

      {/* Delete Confirmation Dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-background rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Remove Staff Account</h3>
                <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to remove <strong>{staffUsers.find(u => u.id === confirmDelete)?.name}</strong>?{' '}
              They will no longer be able to log in.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button variant="destructive" className="flex-1" onClick={() => {
                const name = staffUsers.find(u => u.id === confirmDelete)?.name;
                removeStaffUser(confirmDelete);
                setConfirmDelete(null);
                showFeedback(`Staff account removed: ${name}`);
              }}>Remove</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
