// ============================================================================
// AarogyaLink — Upload Medical Report (Health Worker)
// ----------------------------------------------------------------------------
// The file goes to Convex file storage; the metadata row is written by the
// backend, which also verifies that this health worker's hospital is authorized
// for the patient. Status shown here is always the truth: nothing reads as
// "Uploaded" until the backend confirmed it.
// ============================================================================

import { useMemo, useRef, useState } from 'react';
import type { MedicalReport, Patient, ReportType } from '@/types';
import { useApp } from '@/contexts/AppContext';
import { useData } from '@/contexts/DataContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { REPORT_TYPE_LABELS, REPORT_TYPE_ORDER } from '@/lib/health-card';
import { AlertCircle, CheckCircle2, CloudOff, Loader2, Upload } from 'lucide-react';

interface ReportUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patients: Patient[];
  /** Pre-selected patient (e.g. opened from that patient's row). */
  defaultPatientId?: string;
  onUploaded?: (report: MedicalReport) => void;
}

const MAX_FILE_MB = 25;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type Status =
  | { kind: 'idle' }
  | { kind: 'uploading'; percent: number }
  | { kind: 'syncing' }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string };

export function ReportUploadDialog({
  open, onOpenChange, patients, defaultPatientId, onUploaded,
}: ReportUploadDialogProps) {
  const { isOffline } = useApp();
  const { uploadMedicalReport } = useData();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [patientId, setPatientId] = useState(defaultPatientId ?? '');
  const [type, setType] = useState<ReportType>('lab_report');
  const [title, setTitle] = useState('');
  const [reportDate, setReportDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const selectedPatient = useMemo(
    () => patients.find(p => p.id === patientId),
    [patients, patientId],
  );

  const reset = () => {
    setPatientId(defaultPatientId ?? '');
    setType('lab_report');
    setTitle('');
    setReportDate(todayIso());
    setNotes('');
    setFile(null);
    setStatus({ kind: 'idle' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const busy = status.kind === 'uploading' || status.kind === 'syncing';
  const canSubmit = !!patientId && !!file && title.trim().length > 0 && !!reportDate && !busy && !isOffline;

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] ?? null;
    if (picked && picked.size > MAX_FILE_MB * 1024 * 1024) {
      setStatus({ kind: 'error', message: `That file is larger than the ${MAX_FILE_MB} MB limit.` });
      setFile(null);
      return;
    }
    setStatus({ kind: 'idle' });
    setFile(picked);
  };

  const handleSubmit = async () => {
    if (!file || !patientId) return;
    setStatus({ kind: 'uploading', percent: 0 });
    const result = await uploadMedicalReport(
      { patientId, title: title.trim(), type, reportDate, notes: notes.trim() || undefined, file },
      percent => {
        // 100% means the bytes are up; the metadata write is the last step.
        if (percent >= 100) setStatus({ kind: 'syncing' });
        else setStatus({ kind: 'uploading', percent });
      },
    );
    if (!result.ok || !result.report) {
      setStatus({ kind: 'error', message: result.message });
      return;
    }
    setStatus({ kind: 'done', message: result.message });
    onUploaded?.(result.report);
    // Clear the form but keep the dialog open so the success state is readable.
    setTitle('');
    setNotes('');
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (busy) return; // never drop a live upload
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Medical Report</DialogTitle>
          <DialogDescription>
            The report is added to the patient&apos;s health card record and stays part of their history.
          </DialogDescription>
        </DialogHeader>

        {isOffline ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <CloudOff className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>You are offline. A report file has to reach the server, so uploading needs a connection.</span>
          </div>
        ) : null}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Patient *</label>
            <select
              value={patientId}
              onChange={event => { setPatientId(event.target.value); setStatus({ kind: 'idle' }); }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              disabled={busy}
            >
              <option value="">Select patient…</option>
              {patients.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.healthCardId}
                </option>
              ))}
            </select>
            {selectedPatient && (
              <p className="text-[11px] text-muted-foreground">
                Health Card {selectedPatient.healthCardId} • {selectedPatient.village}, {selectedPatient.district}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Report type *</label>
              <select
                value={type}
                onChange={event => setType(event.target.value as ReportType)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                disabled={busy}
              >
                {REPORT_TYPE_ORDER.map(value => (
                  <option key={value} value={value}>{REPORT_TYPE_LABELS[value]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Report date *</label>
              <Input
                type="date"
                value={reportDate}
                max={todayIso()}
                onChange={event => setReportDate(event.target.value)}
                disabled={busy}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Report title *</label>
            <Input
              value={title}
              onChange={event => setTitle(event.target.value)}
              placeholder="e.g. Complete Blood Count"
              disabled={busy}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Report file *</label>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              disabled={busy}
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.txt"
              className="block w-full cursor-pointer rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary"
            />
            <p className="text-[11px] text-muted-foreground">
              PDF, image or document up to {MAX_FILE_MB} MB. The file is stored securely and referenced from the record.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Notes (optional)</label>
            <Textarea
              value={notes}
              onChange={event => setNotes(event.target.value)}
              placeholder="Anything the doctor should know about this report…"
              className="min-h-[70px]"
              disabled={busy}
            />
          </div>
        </div>

        {/* Status: Offline → Uploading → Syncing → Uploaded → Failed */}
        {status.kind === 'uploading' && (
          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading… {status.percent}%
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${status.percent}%` }} />
            </div>
          </div>
        )}
        {status.kind === 'syncing' && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploaded — saving the report to the patient record…
          </div>
        )}
        {status.kind === 'done' && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            {status.message}
          </div>
        )}
        {status.kind === 'error' && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {status.message}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }} disabled={busy}>
            Close
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={!canSubmit} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
