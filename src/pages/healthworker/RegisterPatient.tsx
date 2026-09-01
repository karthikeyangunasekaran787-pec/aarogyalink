// ============================================================================
// Health Worker — Patient Registration
// ============================================================================

import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { t } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { UserPlus, CheckCircle2, ArrowRight, Heart } from 'lucide-react';

interface PatientForm {
  name: string;
  age: string;
  gender: string;
  phone: string;
  address: string;
  village: string;
  district: string;
  bloodGroup: string;
  aadhaarLast4: string;
  emergencyContact: string;
  allergies: string[];
  chronicConditions: string[];
}

const INITIAL: PatientForm = {
  name: '', age: '', gender: '', phone: '', address: '',
  village: '', district: 'Madurai', bloodGroup: '', aadhaarLast4: '',
  emergencyContact: '', allergies: [], chronicConditions: [],
};

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const COMMON_ALLERGIES = ['Penicillin', 'Sulfa', 'Aspirin', 'Iodine', 'Latex', 'None'];
const COMMON_CONDITIONS = ['Diabetes', 'Hypertension', 'Asthma', 'Heart Disease', 'Thyroid', 'None'];

export default function RegisterPatient() {
  const { language } = useApp();
  const [form, setForm] = useState<PatientForm>(INITIAL);
  const [allergyInput, setAllergyInput] = useState('');
  const [conditionInput, setConditionInput] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const update = (field: keyof PatientForm, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const toggleArrayItem = (field: 'allergies' | 'chronicConditions', item: string) => {
    if (item === 'None') {
      setForm(prev => ({ ...prev, [field]: [] }));
      return;
    }
    setForm(prev => ({
      ...prev,
      [field]: prev[field].includes(item)
        ? prev[field].filter(i => i !== item)
        : [...prev[field], item],
    }));
  };

  const addCustomItem = (field: 'allergies' | 'chronicConditions', input: string, setInput: (v: string) => void) => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setForm(prev => ({
      ...prev,
      [field]: prev[field].includes(trimmed) ? prev[field] : [...prev[field], trimmed],
    }));
    setInput('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <Card className="border-emerald-200">
          <CardContent className="py-12 text-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Patient Registered</h2>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {form.name} has been added to the system. You can now create a referral or run an AI triage assessment.
            </p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <Badge variant="outline" className="text-xs">ID: PAT-{Date.now().toString().slice(-6)}</Badge>
            </div>
            <div className="flex gap-3 justify-center mt-6">
              <Button variant="outline" onClick={() => { setSubmitted(false); setForm(INITIAL); }}>
                Register Another
              </Button>
              <Button className="gap-1.5" onClick={() => window.location.href = '/hw/ai-triage'}>
                Run AI Triage <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <UserPlus className="h-6 w-6 text-primary" />
          {t('registerPatient', language)}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enter the patient's demographic and medical information to register them in the system.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Personal Information */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Full Name *</label>
                <Input
                  value={form.name}
                  onChange={e => update('name', e.target.value)}
                  placeholder="e.g. Lakshmi Devi"
                  required
                  className="h-11"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Age *</label>
                <Input
                  type="number"
                  value={form.age}
                  onChange={e => update('age', e.target.value)}
                  placeholder="e.g. 62"
                  required
                  min="0"
                  max="120"
                  className="h-11"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Gender *</label>
                <div className="flex gap-2">
                  {['Female', 'Male', 'Other'].map(g => (
                    <Button
                      key={g}
                      type="button"
                      variant={form.gender === g ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1 h-10"
                      onClick={() => update('gender', g)}
                    >
                      {g}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Phone *</label>
                <Input
                  type="tel"
                  value={form.phone}
                  onChange={e => update('phone', e.target.value)}
                  placeholder="e.g. 9876543210"
                  required
                  className="h-11"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Address */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Address</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Street Address</label>
              <Input
                value={form.address}
                onChange={e => update('address', e.target.value)}
                placeholder="e.g. 12 Amman Kovil Street"
                className="h-11"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Village *</label>
                <Input
                  value={form.village}
                  onChange={e => update('village', e.target.value)}
                  placeholder="e.g. Kallikudi"
                  required
                  className="h-11"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">District</label>
                <Input
                  value={form.district}
                  onChange={e => update('district', e.target.value)}
                  placeholder="e.g. Madurai"
                  className="h-11"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Medical Details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Medical Details</CardTitle>
            <CardDescription>Blood group and known medical history</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Blood Group</label>
              <div className="flex flex-wrap gap-2">
                {BLOOD_GROUPS.map(bg => (
                  <Button
                    key={bg}
                    type="button"
                    variant={form.bloodGroup === bg ? 'default' : 'outline'}
                    size="sm"
                    className="h-9 px-3"
                    onClick={() => update('bloodGroup', bg)}
                  >
                    {bg}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Aadhaar (Last 4 digits)</label>
              <Input
                value={form.aadhaarLast4}
                onChange={e => update('aadhaarLast4', e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="XXXX"
                maxLength={4}
                className="h-11 w-32"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Emergency Contact</label>
              <Input
                type="tel"
                value={form.emergencyContact}
                onChange={e => update('emergencyContact', e.target.value)}
                placeholder="Phone number"
                className="h-11"
              />
            </div>

            {/* Allergies */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Known Allergies</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {COMMON_ALLERGIES.map(a => (
                  <Button
                    key={a}
                    type="button"
                    variant={form.allergies.includes(a) ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => toggleArrayItem('allergies', a)}
                  >
                    {a}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={allergyInput}
                  onChange={e => setAllergyInput(e.target.value)}
                  placeholder="Add custom allergy"
                  className="h-9 text-sm"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomItem('allergies', allergyInput, setAllergyInput); } }}
                />
                <Button type="button" variant="outline" size="sm" className="h-9"
                  onClick={() => addCustomItem('allergies', allergyInput, setAllergyInput)}>
                  Add
                </Button>
              </div>
              {form.allergies.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {form.allergies.map(a => (
                    <Badge key={a} variant="outline" className="text-xs gap-1">
                      {a}
                      <button type="button" onClick={() => toggleArrayItem('allergies', a)} className="text-muted-foreground hover:text-destructive">×</button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Chronic Conditions */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Chronic Conditions</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {COMMON_CONDITIONS.map(c => (
                  <Button
                    key={c}
                    type="button"
                    variant={form.chronicConditions.includes(c) ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => toggleArrayItem('chronicConditions', c)}
                  >
                    {c}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={conditionInput}
                  onChange={e => setConditionInput(e.target.value)}
                  placeholder="Add custom condition"
                  className="h-9 text-sm"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomItem('chronicConditions', conditionInput, setConditionInput); } }}
                />
                <Button type="button" variant="outline" size="sm" className="h-9"
                  onClick={() => addCustomItem('chronicConditions', conditionInput, setConditionInput)}>
                  Add
                </Button>
              </div>
              {form.chronicConditions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {form.chronicConditions.map(c => (
                    <Badge key={c} variant="outline" className="text-xs gap-1">
                      {c}
                      <button type="button" onClick={() => toggleArrayItem('chronicConditions', c)} className="text-muted-foreground hover:text-destructive">×</button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Button type="submit" className="w-full h-12 text-base font-semibold gap-2">
          <UserPlus className="h-4 w-4" />
          Register Patient
        </Button>
      </form>
    </div>
  );
}
