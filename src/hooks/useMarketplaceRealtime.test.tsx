import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMarketplaceQuestions, useMarketplaceRealtime } from './useMarketplaces';

const mock = vi.hoisted(() => ({ channels: [] as any[], rows: [] as any[], remove: vi.fn(), filters: [] as any[] }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  channel: (name: string) => {
    const channel: any = { name, callbacks: [], on(type: string, filter: any, callback: any) {
      this.callbacks.push({type, filter, callback}); return this;
    }, subscribe(callback: any) { this.status = callback; return this; } };
    mock.channels.push(channel); return channel;
  }, removeChannel: mock.remove,
  from: () => {
    const filters: any[] = []; mock.filters = filters;
    const q: any = { select: () => q, not: () => q, order: () => q, or: () => q,
      eq: (key: string, value: any) => { filters.push([key,value]); return q; },
      in: (key: string, values: any[]) => {filters.push([key, values]);return q;},
      then: (resolve: any) => Promise.resolve({data: mock.rows.filter(r => filters.every(([k,v])=>Array.isArray(v)?v.includes(r[k]):r[k]===v)), error:null}).then(resolve),
    }; return q;
  },
} }));
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}}); clients.push(client);
  const wrapper = ({children}: any) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return {client, wrapper};
}
beforeEach(()=>{mock.channels=[];mock.rows=[];vi.clearAllMocks();});
afterEach(()=>{cleanup();clients.splice(0).forEach(c=>c.clear());vi.useRealTimers();});
const emit = (type: string, payload: any) => mock.channels[0].callbacks.find((b:any)=>b.type===type).callback(payload);

describe('marketplace live updates',()=>{
  it('shows live only after PostgreSQL readiness and recovers missed changes when reconnecting',()=>{
    const {client,wrapper}=setup();const invalidate=vi.spyOn(client,'invalidateQueries');
    const {result,unmount}=renderHook(()=>useMarketplaceRealtime(),{wrapper});
    act(()=>mock.channels[0].status('SUBSCRIBED'));
    expect(result.current).toBe('connecting');
    act(()=>emit('system',{extension:'postgres_changes',status:'ok'}));
    expect(result.current).toBe('live');
    expect(invalidate).toHaveBeenCalledWith({queryKey:['marketplace-questions']});
    act(()=>mock.channels[0].status('CHANNEL_ERROR'));
    expect(result.current).toBe('reconnecting');
    invalidate.mockClear();
    act(()=>emit('system',{extension:'postgres_changes',status:'ok'}));
    expect(result.current).toBe('live');
    expect(invalidate).toHaveBeenCalledWith({queryKey:['marketplace-unanswered-count']});
    expect(mock.channels[0].callbacks.find((b:any)=>b.type==='postgres_changes').filter.table).toBe('marketplace_questions');
    unmount();expect(mock.remove).toHaveBeenCalledTimes(2);
  });
  it('polls only as a fallback and refreshes on returning to the window',()=>{
    vi.useFakeTimers();const {client,wrapper}=setup();const invalidate=vi.spyOn(client,'invalidateQueries');
    renderHook(()=>useMarketplaceRealtime(),{wrapper});
    act(()=>vi.advanceTimersByTime(15000));
    expect(invalidate).toHaveBeenCalledWith({queryKey:['marketplace-questions']});
    act(()=>emit('system',{extension:'postgres_changes',status:'ok'}));invalidate.mockClear();
    act(()=>vi.advanceTimersByTime(30000));expect(invalidate).not.toHaveBeenCalled();
    act(()=>window.dispatchEvent(new Event('focus')));
    expect(invalidate).toHaveBeenCalledWith({queryKey:['marketplace-questions']});
    invalidate.mockClear();act(()=>emit('system',{extension:'postgres_changes',status:'error'}));
    act(()=>vi.advanceTimersByTime(15000));expect(invalidate).toHaveBeenCalled();
  });
  for(const seller of ['532562281','3642409154','2237203375']) {
    it(`refreshes the confirmed answer for ${seller} without mixing the account filter`,async()=>{
      const {wrapper}=setup();
      mock.rows=[{id:'question',platform:'mercado_livre',seller_id:seller,status:'unanswered'},
        {id:'foreign',platform:'mercado_livre',seller_id:'other',status:'answered',answer_text:'Foreign answer'}];
      const {result}=renderHook(()=>{useMarketplaceRealtime();return useMarketplaceQuestions('all','all',undefined,seller);},{wrapper});
      await waitFor(()=>expect(result.current.data).toHaveLength(1));
      mock.rows[0]={...mock.rows[0],status:'answered',answer_text:'Olá! O material é MDF.',answered_by:'ai_agent'};
      act(()=>emit('postgres_changes',{eventType:'UPDATE',new:mock.rows[0]}));
      await waitFor(()=>expect(result.current.data?.[0].answer_text).toBe('Olá! O material é MDF.'));
      expect(result.current.data?.[0].seller_id).toBe(seller);
      expect(result.current.data).toHaveLength(1);
      expect(mock.filters).toContainEqual(['seller_id',seller]);
    });
  }
});
