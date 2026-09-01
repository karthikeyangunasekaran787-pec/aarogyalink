// ============================================================================
// Medicine Availability
// ============================================================================

import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { t } from '@/lib/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useData } from '@/contexts/DataContext';
import { Pill, Search, AlertTriangle, CheckCircle2 } from 'lucide-react';

const STATUS_CONFIG = {
  in_stock: { icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'In Stock' },
  low_stock: { icon: AlertTriangle, color: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Low Stock' },
  out_of_stock: { icon: AlertTriangle, color: 'bg-red-50 text-red-700 border-red-200', label: 'Out of Stock' },
};

export default function Medicines() {
  const { medicineStock } = useData();
  const { language } = useApp();
  const [search, setSearch] = useState('');

  const filtered = medicineStock.filter(m =>
    !search || m.medicineName.toLowerCase().includes(search.toLowerCase()) || m.facilityName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Pill className="h-6 w-6 text-primary" />
          {t('medicines', language)}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Check medicine availability across nearby facilities
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search medicine or facility..."
          className="pl-9"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filtered.map(ms => {
          const config = STATUS_CONFIG[ms.status];
          const Icon = config.icon;
          return (
            <Card key={ms.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">{ms.medicineName}</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">{ms.facilityName}</p>
                  </div>
                  <Badge className={`text-[10px] ${config.color}`}>
                    <Icon className="h-3 w-3 mr-0.5" />
                    {config.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                  <span>Qty: {ms.quantity} {ms.unit}</span>
                  <span>Exp: {ms.expiryDate}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
