import { useState } from 'react';
import { HelpCircle, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { PlatformBadge } from './PlatformBadge';
import { QuestionCard } from './QuestionCard';
import { useMarketplaceQuestions } from '@/hooks/useMarketplaces';
import { cn } from '@/lib/utils';

const platforms = [
  { value: 'all', label: 'Todas' },
  { value: 'mercado_livre', label: 'ML', platform: 'mercado_livre' },
  { value: 'shopee', label: 'Shopee', platform: 'shopee' },
  { value: 'amazon', label: 'Amazon', platform: 'amazon' },
];

export function QuestionsTab() {
  const [platform, setPlatform] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');

  const { data: questions, isLoading, isError, refetch } = useMarketplaceQuestions(
    platform,
    status,
    search || undefined
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Platform toggles */}
        <div className="flex gap-1.5">
          {platforms.map((p) => (
            <Button
              key={p.value}
              variant={platform === p.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPlatform(p.value)}
              className={cn(
                'h-8',
                platform === p.value && p.value === 'all' && 'bg-primary text-primary-foreground'
              )}
            >
              {p.platform ? <PlatformBadge platform={p.platform} /> : p.label}
            </Button>
          ))}
        </div>

        {/* Status filter */}
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[180px] h-8">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="unanswered">Não Respondidas</SelectItem>
            <SelectItem value="answered">Respondidas</SelectItem>
            <SelectItem value="ai_suggested">Sugestão IA</SelectItem>
          </SelectContent>
        </Select>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por pergunta ou produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8"
          />
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-12 rounded" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex flex-col items-center py-12 text-center">
          <p className="text-sm text-destructive mb-2">Erro ao carregar perguntas</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && questions?.length === 0 && (
        <div className="flex flex-col items-center py-16 text-center">
          <HelpCircle className="h-12 w-12 text-muted-foreground mb-3" />
          <p className="text-base font-medium text-foreground">Nenhuma pergunta pendente 🎉</p>
          <p className="text-sm text-muted-foreground mt-1">Suas perguntas estão em dia!</p>
        </div>
      )}

      {/* List */}
      {!isLoading && !isError && questions && questions.length > 0 && (
        <div className="space-y-3">
          {questions.map((q) => (
            <QuestionCard key={q.id} question={q} />
          ))}
        </div>
      )}
    </div>
  );
}
