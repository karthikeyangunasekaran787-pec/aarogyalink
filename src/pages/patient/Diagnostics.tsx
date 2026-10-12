// ============================================================================
// Diagnostics Availability
// ============================================================================

import { useState } from 'react';
import { useTranslation } from '@/hooks/use-translation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useData } from '@/contexts/DataContext';
import { TestTube, Search, Clock, IndianRupee, CheckCircle2, XCircle } from 'lucide-react';

export default function DiagnosticsPage() {
  const { t } = useTranslation();
  const { diagnostics } = useData();
  const [search, setSearch] = useState('');

  const filtered = diagnostics.filter(d =>
    !search || d.name.toLowerCase().includes(search.toLowerCase()) || d.facilityName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <TestTube className="h-6 w-6 text-primary" />
          {t('diagnostics')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t('diagnosticsSubtitle')}</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchTestPlaceholder')}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <TestTube className="h-9 w-9 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t('noDataAvailable')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map(d => (
            <Card key={d.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-foreground break-words">{d.name}</h4>
                    <p className="text-xs text-muted-foreground">{d.facilityName}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] flex-shrink-0">{d.category}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {/* Availability is written out, not signalled by colour/icon alone. */}
                  <span className="flex items-center gap-1">
                    {d.available ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <XCircle className="h-3 w-3 text-red-400" />}
                    {d.available ? t('availableLabel') : t('unavailableLabel')}
                  </span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t('waitDaysLabel', { count: d.waitTime })}</span>
                  <span className="flex items-center gap-1"><IndianRupee className="h-3 w-3" />{d.cost}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
