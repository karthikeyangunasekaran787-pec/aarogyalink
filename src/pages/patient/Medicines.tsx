// ============================================================================
// Medicine Availability
// ============================================================================

import { useState } from 'react';
import { useTranslation } from '@/hooks/use-translation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useData } from '@/contexts/DataContext';
import type { TranslationKey } from '@/lib/i18n';
import { Pill, Search, AlertTriangle, CheckCircle2 } from 'lucide-react';

// Status is spelled out in the badge, never colour alone.
const STATUS_CONFIG = {
  in_stock: { icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'medicineInStock' },
  low_stock: { icon: AlertTriangle, color: 'bg-amber-50 text-amber-700 border-amber-200', label: 'medicineLowStock' },
  out_of_stock: { icon: AlertTriangle, color: 'bg-red-50 text-red-700 border-red-200', label: 'medicineOutOfStock' },
} satisfies Record<string, { icon: typeof Pill; color: string; label: TranslationKey }>;

export default function Medicines() {
  const { medicineStock } = useData();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const filtered = medicineStock.filter(m =>
    !search || m.medicineName.toLowerCase().includes(search.toLowerCase()) || m.facilityName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Pill className="h-6 w-6 text-primary" />
          {t('medicines')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t('medicinesSubtitle')}</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchMedicinePlaceholder')}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Pill className="h-9 w-9 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t('noDataAvailable')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map(ms => {
            const config = STATUS_CONFIG[ms.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.in_stock;
            const Icon = config.icon;
            return (
              <Card key={ms.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-foreground break-words">{ms.medicineName}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">{ms.facilityName}</p>
                    </div>
                    <Badge className={`text-[10px] flex-shrink-0 ${config.color}`}>
                      <Icon className="h-3 w-3 mr-0.5" />
                      {t(config.label)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-xs text-muted-foreground">
                    <span>{t('qtyLabel')}: {ms.quantity} {ms.unit}</span>
                    <span>{t('expLabel')}: {ms.expiryDate}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
