// ============================================================================
// AarogyaLink — Medical report list
// ----------------------------------------------------------------------------
// One list used by the patient ("My Reports") and by the doctor's patient view,
// so both see the same chronological record: newest first, grouped by year, with
// search and the report-type filters.
//
// View / Download resolve through the backend (`getReportFileUrl`), which is what
// decides whether this caller may read the file — the buttons are only a
// convenience, never the access control.
// ============================================================================

import { useMemo, useState } from 'react';
import type { MedicalReport } from '@/types';
import { useData } from '@/contexts/DataContext';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  REPORT_FILTERS,
  REPORT_FILTER_KEYS,
  formatFileSize,
  formatReportDate,
  reportTypeKey,
  reportTypeLabel,
  reportYear,
  type ReportFilterKey,
} from '@/lib/health-card';
import { useTranslation } from '@/hooks/use-translation';
import { Building2, Download, Eye, FileText, Loader2, Search, UserRound } from 'lucide-react';

interface ReportListProps {
  reports: MedicalReport[];
  /** Show who uploaded each report and from where (hidden in compact views). */
  showUploader?: boolean;
  emptyMessage?: string;
  className?: string;
}

export function ReportList({ reports, showUploader = true, emptyMessage, className }: ReportListProps) {
  const { getReportFileUrl } = useData();
  const { t } = useTranslation();
  const [filter, setFilter] = useState<ReportFilterKey>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<{ id: string; action: 'view' | 'download' } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return reports
      .filter(report => filter === 'all' || report.type === filter)
      .filter(report => {
        if (!needle) return true;
        // Dates are searchable too, so "2026-09" or "Sep 2026" narrows the list.
        return [
          report.title,
          report.reportId,
          report.facilityName,
          report.uploadedBy,
          reportTypeLabel(report.type),
          report.reportDate,
          formatReportDate(report.reportDate),
          formatReportDate(report.uploadedAt),
        ]
          .filter(Boolean)
          .some(value => String(value).toLowerCase().includes(needle));
      })
      .slice()
      .sort((a, b) => b.reportDate.localeCompare(a.reportDate) || b.uploadedAt.localeCompare(a.uploadedAt));
  }, [reports, filter, query]);

  // Chronological sections: 2026, then 2025, … newest first.
  const byYear = useMemo(() => {
    const groups = new Map<string, MedicalReport[]>();
    for (const report of visible) {
      const year = reportYear(report);
      const list = groups.get(year);
      if (list) list.push(report);
      else groups.set(year, [report]);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [visible]);

  const openFile = async (report: MedicalReport, action: 'view' | 'download') => {
    setNotice(null);
    setBusy({ id: report.id, action });
    const result = await getReportFileUrl(report.id);
    setBusy(null);
    if (!result.ok || !result.url) {
      setNotice(result.message || t('loadFailed'));
      return;
    }
    if (action === 'view') {
      window.open(result.url, '_blank', 'noopener');
      return;
    }
    const fileName = result.fileName || report.fileName || 'report';
    try {
      const response = await fetch(result.url);
      if (!response.ok) throw new Error('fetch_failed');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch {
      // Cross-origin storage that refuses a scripted download still opens, and
      // the browser's own save action can finish it.
      window.open(result.url, '_blank', 'noopener');
      setNotice(t('reportOpenedNewTab'));
    }
  };

  const filterCount = (key: ReportFilterKey) =>
    key === 'all' ? reports.length : reports.filter(report => report.type === key).length;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Search + filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t('searchReportsPlaceholder')}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {REPORT_FILTERS.map(option => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              aria-pressed={filter === option.key}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                filter === option.key
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {t(REPORT_FILTER_KEYS[option.key] ?? 'all')}
              <span className="ml-1.5 text-[10px] text-muted-foreground/80">{filterCount(option.key)}</span>
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{notice}</p>
      )}

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-10 text-center">
          <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {emptyMessage ?? (reports.length === 0 ? t('noReportsYet') : t('noReportsMatchFilters'))}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {byYear.map(([year, list]) => (
            <div key={year} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{year}</p>
              <div className="space-y-2">
                {list.map(report => (
                  <div
                    key={report.id}
                    className="flex flex-col gap-3 rounded-xl border border-border bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 gap-3">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">{report.title}</p>
                          <Badge variant="outline" className="text-[10px]">{t(reportTypeKey(report.type))}</Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t('reportDate')}: {formatReportDate(report.reportDate)}
                          {report.fileSize ? ` • ${formatFileSize(report.fileSize)}` : ''}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {t('uploadedLabel', { date: formatReportDate(report.uploadedAt) })}
                          {report.facilityName ? (
                            <>
                              {' '}• <Building2 className="mb-0.5 inline h-3 w-3" /> {report.facilityName}
                            </>
                          ) : null}
                          {showUploader && report.uploadedBy ? (
                            <>
                              {' '}• <UserRound className="mb-0.5 inline h-3 w-3" /> {report.uploadedBy}
                            </>
                          ) : null}
                        </p>
                        {report.notes && <p className="mt-1 text-[11px] italic text-muted-foreground">{report.notes}</p>}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-xs"
                        disabled={busy?.id === report.id}
                        onClick={() => void openFile(report, 'view')}
                      >
                        {busy?.id === report.id && busy.action === 'view'
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Eye className="h-3.5 w-3.5" />}
                        {t('viewAction')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-xs"
                        disabled={busy?.id === report.id}
                        onClick={() => void openFile(report, 'download')}
                      >
                        {busy?.id === report.id && busy.action === 'download'
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Download className="h-3.5 w-3.5" />}
                        {t('download')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
