// ============================================================================
// District Admin — Hospital Management
// Register and manage hospitals within the district
// ============================================================================

import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Building2, Plus, Search, MapPin, Phone, Mail,
  Bed, Edit2, Power, PowerOff, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle2, X, Trash2, Lock
} from 'lucide-react';
import type { Hospital } from '@/types';

const HOSPITAL_TYPES = ['government', 'private', 'trust', 'charitable'] as const;

type FormState = {
  name: string;
  type: typeof HOSPITAL_TYPES[number];
  address: string;
  district: string;
  phone: string;
  email: string;
  departments: string;
  services: string;
  totalBeds: number;
  adminName: string;
  adminUsername: string;
  adminEmail: string;
  adminPhone: string;
  adminPassword: string;
};

const EMPTY_FORM: FormState = {
  name: '', type: 'government', address: '', district: 'Madurai',
  phone: '', email: '', departments: '', services: '',
  totalBeds: 50, adminName: '', adminUsername: '', adminEmail: '',
  adminPhone: '', adminPassword: '',
};

export default function HospitalManagement() {
  const { currentUser } = useApp();
  const { hospitals, addHospital, updateHospital, toggleHospitalStatus, removeHospital, addStaffUser, staffUsers } = useData();
  const [showForm, setShowForm] = useState(false);
  const [editingHospital, setEditingHospital] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedHospital, setExpandedHospital] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [validationError, setValidationError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const filteredHospitals = hospitals.filter(h => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return h.name.toLowerCase().includes(q) || h.hospitalId.toLowerCase().includes(q) || h.district.toLowerCase().includes(q);
  });

  const handleCreate = () => {
    if (!form.name || !form.address || !form.phone || !form.adminName || !form.adminUsername || !form.adminPassword) {
      setValidationError('Please fill in: Name, Address, Phone, Admin Name, Admin Username, and Login Password.');
      return;
    }
    setValidationError('');

    // Create hospital
    const hospital = addHospital({
      name: form.name,
      type: form.type,
      address: form.address,
      district: form.district,
      state: 'Tamil Nadu',
      phone: form.phone,
      email: form.email,
      departments: form.departments.split(',').map(d => d.trim()).filter(Boolean),
      services: form.services.split(',').map(s => s.trim()).filter(Boolean),
      totalBeds: form.totalBeds,
      occupiedBeds: 0,
      status: 'active',
      adminUserId: '',
      createdByUserId: currentUser?.id || '',
    });

    // Create Hospital Administrator account with provided login credentials
    const adminUser = addStaffUser({
      name: form.adminName,
      email: form.adminEmail,
      role: 'hospital_admin',
      username: form.adminUsername,
      password: form.adminPassword,
      phone: form.adminPhone,
      facilityId: hospital.id,
      status: 'active',
      createdBy: currentUser?.id,
      mustChangePassword: false,
    });

    // Update hospital with admin user ID
    updateHospital(hospital.id, { adminUserId: adminUser.id });

    showFeedback('success', `Hospital "${form.name}" created with administrator account "${form.adminUsername}".`);
    setForm({ ...EMPTY_FORM });
    setShowForm(false);
  };

  const handleEdit = (hospital: Hospital) => {
    setEditingHospital(hospital.id);
    setForm({
      name: hospital.name,
      type: hospital.type,
      address: hospital.address,
      district: hospital.district,
      phone: hospital.phone,
      email: hospital.email,
      departments: hospital.departments.join(', '),
      services: hospital.services.join(', '),
      totalBeds: hospital.totalBeds,
      adminName: '', adminUsername: '', adminEmail: '', adminPhone: '', adminPassword: '',
    });
    setShowForm(true);
  };

  const handleUpdate = () => {
    if (!editingHospital) return;
    updateHospital(editingHospital, {
      name: form.name,
      type: form.type,
      address: form.address,
      district: form.district,
      phone: form.phone,
      email: form.email,
      departments: form.departments.split(',').map(d => d.trim()).filter(Boolean),
      services: form.services.split(',').map(s => s.trim()).filter(Boolean),
      totalBeds: form.totalBeds,
    });
    showFeedback('success', 'Hospital updated successfully.');
    setShowForm(false);
    setEditingHospital(null);
  };

  const handleToggleStatus = (hospitalId: string) => {
    toggleHospitalStatus(hospitalId);
    const h = hospitals.find(h => h.id === hospitalId);
    showFeedback('success', `${h?.name} ${h?.status === 'active' ? 'deactivated' : 'activated'}.`);
  };

  const getHospitalAdmin = (adminUserId: string) => staffUsers.find(u => u.id === adminUserId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Hospital Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Register and manage hospitals in your district
          </p>
        </div>
        <Button onClick={() => { setShowForm(true); setEditingHospital(null); setForm({ ...EMPTY_FORM }); }} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Register Hospital
        </Button>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${feedback.type === 'success' ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
          {feedback.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {feedback.message}
          <button onClick={() => setFeedback(null)} className="ml-auto cursor-pointer"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Hospitals', value: hospitals.length, color: 'text-primary' },
          { label: 'Active', value: hospitals.filter(h => h.status === 'active').length, color: 'text-emerald-600' },
          { label: 'Inactive', value: hospitals.filter(h => h.status === 'inactive').length, color: 'text-amber-600' },
          { label: 'Total Beds', value: hospitals.reduce((s, h) => s + h.totalBeds, 0), color: 'text-blue-600' },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Form */}
      {showForm && (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {editingHospital ? 'Edit Hospital' : 'Register New Hospital'}
              </CardTitle>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setShowForm(false); setEditingHospital(null); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {validationError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {validationError}
              </div>
            )}

            {/* Hospital Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Hospital Name *</label>
                <Input value={form.name} onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setValidationError(''); }} placeholder="e.g. District Government Hospital" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Hospital Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as typeof form.type }))}
                  className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm">
                  {HOSPITAL_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Address *</label>
                <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Full address" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">District</label>
                <Input value={form.district} onChange={e => setForm(f => ({ ...f, district: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Phone *</label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="0452-XXXXXXXX" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Email</label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="hospital@district.gov.in" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Total Beds</label>
                <Input type="number" value={form.totalBeds} onChange={e => setForm(f => ({ ...f, totalBeds: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Departments (comma-separated)</label>
                <Input value={form.departments} onChange={e => setForm(f => ({ ...f, departments: e.target.value }))} placeholder="General Medicine, Cardiology, Orthopaedics" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Services (comma-separated)</label>
                <Input value={form.services} onChange={e => setForm(f => ({ ...f, services: e.target.value }))} placeholder="OPD, IPD, Emergency, Surgery, ICU" />
              </div>
            </div>

            {/* Admin Account (only when creating) */}
            {!editingHospital && (
              <>
                <div className="border-t border-border pt-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Hospital Administrator Account</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Admin Name *</label>
                      <Input value={form.adminName} onChange={e => { setForm(f => ({ ...f, adminName: e.target.value })); setValidationError(''); }} placeholder="e.g. Rajesh Kumar" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Admin Username *</label>
                      <Input value={form.adminUsername} onChange={e => { setForm(f => ({ ...f, adminUsername: e.target.value })); setValidationError(''); }} placeholder="e.g. rajesh.admin" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Admin Email</label>
                      <Input type="email" value={form.adminEmail} onChange={e => setForm(f => ({ ...f, adminEmail: e.target.value }))} placeholder="admin@hospital.gov.in" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Admin Phone</label>
                      <Input value={form.adminPhone} onChange={e => setForm(f => ({ ...f, adminPhone: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Login Password *</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="text"
                          value={form.adminPassword}
                          onChange={e => { setForm(f => ({ ...f, adminPassword: e.target.value })); setValidationError(''); }}
                          placeholder="Temporary login password"
                          className="pl-9"
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground">Login ID: {form.adminUsername || '(set above)'} — Password: {form.adminPassword || '(set above)'}</p>
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => { setShowForm(false); setEditingHospital(null); }}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={editingHospital ? handleUpdate : handleCreate}>
                {editingHospital ? 'Update Hospital' : 'Create Hospital & Admin Account'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search hospitals by name, ID, or district..." className="pl-9" />
      </div>

      {/* Hospital List */}
      <div className="space-y-3">
        {filteredHospitals.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <Building2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No hospitals found.</p>
            </CardContent>
          </Card>
        ) : (
          filteredHospitals.map(hospital => {
            const admin = getHospitalAdmin(hospital.adminUserId);
            const isExpanded = expandedHospital === hospital.id;

            return (
              <Card key={hospital.id} className={hospital.status === 'inactive' ? 'opacity-60' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-foreground">{hospital.name}</h3>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          hospital.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                          {hospital.status}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                          {hospital.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {hospital.address}, {hospital.district}
                        </span>
                        <span className="flex items-center gap-1">
                          <Bed className="h-3 w-3" />
                          {hospital.occupiedBeds}/{hospital.totalBeds} beds
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{hospital.phone}</span>
                        {hospital.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{hospital.email}</span>}
                      </div>
                      {admin && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Admin:</span> {admin.name} ({admin.username})
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpandedHospital(isExpanded ? null : hospital.id)}>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(hospital)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggleStatus(hospital.id)}>
                        {hospital.status === 'active' ? <PowerOff className="h-4 w-4 text-amber-600" /> : <Power className="h-4 w-4 text-emerald-600" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setConfirmDelete(hospital.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border space-y-2">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="text-center p-2 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground">Departments</p>
                          <p className="text-sm font-semibold">{hospital.departments.length}</p>
                        </div>
                        <div className="text-center p-2 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground">Services</p>
                          <p className="text-sm font-semibold">{hospital.services.length}</p>
                        </div>
                        <div className="text-center p-2 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground">Bed Occupancy</p>
                          <p className="text-sm font-semibold">{hospital.totalBeds > 0 ? Math.round((hospital.occupiedBeds / hospital.totalBeds) * 100) : 0}%</p>
                        </div>
                        <div className="text-center p-2 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground">Hospital ID</p>
                          <p className="text-sm font-semibold">{hospital.hospitalId}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-foreground mb-1">Departments</p>
                        <div className="flex flex-wrap gap-1">
                          {hospital.departments.map(d => (
                            <span key={d} className="text-[10px] px-2 py-0.5 bg-primary/5 text-primary rounded-full">{d}</span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-foreground mb-1">Services</p>
                        <div className="flex flex-wrap gap-1">
                          {hospital.services.map(s => (
                            <span key={s} className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">{s}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
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
                <h3 className="text-sm font-semibold text-foreground">Remove Hospital</h3>
                <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to remove <strong>{hospitals.find(h => h.id === confirmDelete)?.name}</strong>?{' '}
              The associated Hospital Administrator account will also be disabled.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button variant="destructive" className="flex-1" onClick={() => {
                const name = hospitals.find(h => h.id === confirmDelete)?.name;
                removeHospital(confirmDelete);
                setConfirmDelete(null);
                showFeedback('success', `Hospital "${name}" removed and administrator account disabled.`);
              }}>Remove</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
