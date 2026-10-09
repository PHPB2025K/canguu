import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EscalationCard } from "./EscalationCard";

afterEach(cleanup);
const fixture = (ack="verified", orderStatus="confirmed"): any => ({
  id:"case-123",status:"pending",urgency:"medium",reason:"Medida divergente",conversation_id:null,
  marketplace_question_id:"q1",recentMessages:[],
  marketplace_context:{account_label:"ML2 · Kanoa",subject:"Qual a medida?",order:{status:orderStatus,id:orderStatus==="not_linked"?null:"2000012345678"}},
  marketplace_questions:{platform_question_id:"12345",platform_item_id:"MLB100",product_name:"Jogo de memória",
    question_text:"Qual a medida?",answer_text:"Olá! Obrigada pela pergunta.",ai_classification:{handoff:{ack_status:ack}}},
});
describe("Mercado Livre in Escalonamentos",()=>{
  it("shows account, order, subject, original question and acknowledgement; keeps actions in the human queue",()=>{
    const assign=vi.fn(),resolve=vi.fn();
    render(<MemoryRouter><EscalationCard escalation={fixture()} onAssign={assign} onResolve={resolve}/></MemoryRouter>);
    expect(screen.getByText("ML2 · Kanoa")).toBeInTheDocument();
    expect(screen.getByText(/2000012345678/)).toBeInTheDocument();
    expect(screen.getByText("Pergunta #12345:")).toBeInTheDocument();
    expect(screen.getByText(/Enviado e confirmado/)).toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Ver Conversa"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Assumir"}));
    fireEvent.click(screen.getByRole("button",{name:"Resolver"}));
    expect(assign).toHaveBeenCalledOnce();expect(resolve).toHaveBeenCalledOnce();
  });
  it("does not allow resolution before acknowledgement; no order is invented for pre-sale",()=>{
    render(<MemoryRouter><EscalationCard escalation={fixture("pending","not_linked")} onAssign={vi.fn()} onResolve={vi.fn()}/></MemoryRouter>);
    expect(screen.getByText(/Sem pedido vinculado/)).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Resolver"})).toBeDisabled();
  });
  it("clearly labels an unconfirmed order candidate",()=>{
    render(<MemoryRouter><EscalationCard escalation={fixture("verified","candidate")} onAssign={vi.fn()} onResolve={vi.fn()}/></MemoryRouter>);
    expect(screen.getByText(/vínculo com a pergunta a confirmar/)).toBeInTheDocument();
  });
  it("preserves the conversation action for existing channels",()=>{
    const legacy={...fixture(),marketplace_question_id:null,marketplace_questions:null,conversation_id:"conversation-1"};
    render(<MemoryRouter><EscalationCard escalation={legacy} onAssign={vi.fn()} onResolve={vi.fn()}/></MemoryRouter>);
    expect(screen.getByRole("button",{name:"Ver Conversa"})).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Resolver"})).toBeEnabled();
    expect(screen.queryByText("ML2 · Kanoa")).not.toBeInTheDocument();
  });
});
