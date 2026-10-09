import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QuestionCard } from './QuestionCard';

const actions = vi.hoisted(() => ({answer: vi.fn(), resolve: vi.fn()}));
vi.mock('@/hooks/useMarketplaces', () => ({
  useAnswerQuestion: () => ({mutate: actions.answer, isPending: false}),
  useResolveMLHandoff: () => ({mutate: actions.resolve, isPending: false}),
  useRejectSuggestion: () => ({mutate: vi.fn(), isPending: false}),
  useFeedbackQuestion: () => ({mutate: vi.fn(), isPending: false}),
  useSubmitCorrection: () => ({mutate: vi.fn(), isPending: false}),
}));
vi.mock('@/hooks/use-toast', () => ({useToast: () => ({toast: vi.fn()})}));
afterEach(() => {cleanup(); vi.clearAllMocks();});

function open(ackStatus: string, resolved = false) {
  const question: any = {id: 'q', platform: 'mercado_livre', seller_id: '3642409154',
    product_name: 'Jogo de memória', question_text: 'Qual a medida?', buyer_nickname: 'Cliente',
    status: resolved ? 'answered' : 'pending', created_at: '2026-10-09T12:00:00Z',
    answer_text: ackStatus === 'verified' ? 'Olá! Obrigada pela pergunta.' : null,
    ai_classification: {handoff: {required: true, ack_status: ackStatus, reason: 'Medida divergente',
      ...(resolved ? {resolved_at: '2026-10-09T13:00:00Z', resolution_note: 'Cadastro corrigido após medição.'} : {})}},
  };
  render(<QuestionCard question={question} />);
  fireEvent.click(screen.getByText('Qual a medida?'));
}
describe('ML human handoff', () => {
  it('keeps the case pending after acknowledgement and saves only an internal resolution', () => {
    open('verified');
    expect(screen.getByText('Atendimento humano')).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Enviar Resposta'})).not.toBeInTheDocument();
    const note='Medida conferida com a equipe; cadastro corrigido.';
    fireEvent.change(screen.getByRole('textbox'), {target: {value: note}});
    fireEvent.click(screen.getByRole('button', {name: 'Registrar resolução interna'}));
    expect(actions.resolve).toHaveBeenCalledWith({id:'q',note}, expect.any(Object));
    expect(actions.answer).not.toHaveBeenCalled();
  });
  it('cannot mark a case resolved while acknowledgement remains unconfirmed', () => {
    open('pending');
    fireEvent.change(screen.getByRole('textbox'), {target: {value: 'Informação conferida e cadastro corrigido.'}});
    expect(screen.getByRole('button', {name:'Registrar resolução interna'})).toBeDisabled();
    expect(screen.getByText(/ainda não foi confirmado/)).toBeInTheDocument();
  });
  it('shows an internal resolution without implying that another public answer was sent', () => {
    open('verified',true);
    expect(screen.getByText('Tratado internamente')).toBeInTheDocument();
    expect(screen.getByText(/Registro interno, sem novo envio/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Enviar Resposta'})).not.toBeInTheDocument();
  });
});

describe('ML account and visible answer', () => {
  for (const [seller, label] of [['532562281','ML1 · Budamix'], ['3642409154','ML2 · Kanoa'], ['2237203375','ML3 · SPBROGLIO']]) {
    it(`shows ${label} and the new answer without expanding the card`, () => {
      const question: any = {id:'q',platform:'mercado_livre',seller_id:seller,product_name:'Jogo',question_text:'Qual o material?',status:'unanswered'};
      const {rerender}=render(<QuestionCard question={question}/>);
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.queryByText('Resposta da ANA')).not.toBeInTheDocument();
      rerender(<QuestionCard question={{...question,status:'answered',answered_by:'ai_agent',answer_text:'Olá! O material é MDF.'}}/>);
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText('Resposta da ANA')).toBeInTheDocument();
      expect(screen.getByText('Olá! O material é MDF.')).toBeInTheDocument();
    });
  }
});
