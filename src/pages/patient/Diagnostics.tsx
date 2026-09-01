// ============================================================================
// Diagnostics Availability
// ============================================================================

import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { t } from '@/lib/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useData } from '@/contexts/DataContext';
import { TestTube, Search, Clock, IndianRupee, CheckCircle2, XCircle } from 'lucide-react';

export default function DiagnosticsPage() {
  const { language } = useApp();
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
          {t('diagnostics', language)}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Check diagnostic test availability and pricing</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search test or facility..." className="pl-9" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filtered.map(d => (
          <Card key={d.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">{d.name}</h4>
                  <p className="text-xs text-muted-foreground">{d.facilityName}</p>
                </div>
                <Badge variant="outline" className="text-[10px]">{d.category}</Badge>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  {d.available ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <XCircle className="h-3 w-3 text-red-400" />}
                  {d.available ? 'Available' : 'Unavailable'}
                </span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{d.waitTime}d wait</span>
                <span className="flex items-center gap-1"><IndianRupee className="h-3 w-3" />{d.cost}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
