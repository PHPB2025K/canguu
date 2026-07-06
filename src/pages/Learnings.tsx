import { useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LearningList } from '@/components/marketplaces/LearningList';
import { useLearningQueueCount } from '@/hooks/useMarketplaces';

const STATUS_OPTIONS = [
  { value: 'auto_review', label: 'Aguardando revisão' },
  { value: 'processed', label: 'Ativos' },
  { value: 'archived', label: 'Arquivados' },
  { value: 'all', label: 'Todos os status' },
];

// Abas por ORIGEM do aprendizado (canal onde a conversa aconteceu).
// O escopo ("Aplica em") continua editável em cada card — é outra dimensão.
const CHANNEL_TABS = [
  { value: 'all', label: 'Todos' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'mercado_livre', label: 'Marketplace' },
];

const Learnings = () => {
  const [status, setStatus] = useState('auto_review');
  const [channel, setChannel] = useState('all');
  const { data: pending = 0 } = useLearningQueueCount();

  return (
    <div className="flex flex-col h-[calc(100vh-5.5rem)] overflow-hidden gap-4">
      <div className="shrink-0 space-y-2">
        <PageHeader
          title="Aprendizados da Ana"
          description="Base única e centralizada de aprendizados — a mesma fonte que alimenta WhatsApp, Instagram e Marketplaces. Aqui você cura: aprova, edita, ajusta o escopo (canais) e arquiva."
        />
        <div className="flex items-center gap-3 flex-wrap">
          <Tabs value={channel} onValueChange={setChannel}>
            <TabsList>
              {CHANNEL_TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[200px] h-8">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <GraduationCap className="h-4 w-4" />
            {pending > 0 ? `${pending} aguardando sua revisão` : 'Fila de revisão vazia'}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <LearningList
          curation
          channel={channel === 'all' ? undefined : channel}
          statuses={status === 'all' ? undefined : [status]}
        />
      </div>
    </div>
  );
};

export default Learnings;
