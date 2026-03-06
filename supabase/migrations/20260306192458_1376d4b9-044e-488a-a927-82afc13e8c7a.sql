
-- Seed marketplace_questions (20 perguntas)
INSERT INTO public.marketplace_questions (platform, platform_question_id, platform_item_id, product_name, question_text, answer_text, buyer_nickname, status, ai_suggested_answer, answered_by, answered_at, created_at) VALUES
('mercado_livre', 'MLB-Q-12345678', 'MLB-4829173650', 'Pote Hermético Vidro 1520ml', 'Esse pote vai ao micro-ondas?', NULL, 'COMPRADOR_ML_284', 'ai_suggested', 'Olá! Sim, o Pote Hermético de Vidro 1520ml é seguro para micro-ondas. Basta remover a tampa antes de aquecer. Qualquer dúvida estamos à disposição!', NULL, NULL, now() - interval '1 hour'),
('mercado_livre', 'MLB-Q-12345679', 'MLB-4829173651', 'Jarra Medidora 1L', 'Qual a capacidade em litros dessa jarra?', NULL, 'MARIA.SILVA92', 'unanswered', NULL, NULL, NULL, now() - interval '3 hours'),
('mercado_livre', 'MLB-Q-12345680', 'MLB-4829173652', 'Conjunto 5 Potes Herméticos', 'Tem na cor branca?', 'Olá! No momento temos apenas na cor transparente com tampa verde. Obrigado pelo interesse!', 'JOAO_COZINHA', 'answered', NULL, 'human', now() - interval '20 hours', now() - interval '1 day'),
('mercado_livre', 'MLB-Q-12345681', 'MLB-4829173653', 'Coqueteleira Profissional 750ml', 'Vem com garantia? Quanto tempo?', NULL, 'BARTENDER.PRO', 'ai_suggested', 'Olá! Sim, a Coqueteleira Profissional 750ml possui garantia de 90 dias contra defeitos de fabricação. Qualquer problema, é só entrar em contato!', NULL, NULL, now() - interval '5 hours'),
('mercado_livre', 'MLB-Q-12345682', 'MLB-4829173654', 'Kit Bartender 12 Peças', 'Quanto tempo demora pra entregar em SP capital?', NULL, 'LUCAS_SP2024', 'unanswered', NULL, NULL, NULL, now() - interval '2 hours'),
('mercado_livre', 'MLB-Q-12345683', 'MLB-4829173650', 'Pote Hermético Vidro 1520ml', 'Dá pra colocar no freezer?', 'Sim! O vidro borossilicato suporta temperaturas de -20°C a 400°C. Pode usar no freezer sem problema!', 'ANA.ORGANIZA', 'answered', NULL, 'ai_agent', now() - interval '10 hours', now() - interval '12 hours'),
('mercado_livre', 'MLB-Q-12345684', 'MLB-4829173655', 'Balde de Gelo Inox 3L', 'Esse balde enferruja com o tempo?', NULL, 'FESTA.SEMPRE', 'unanswered', NULL, NULL, NULL, now() - interval '6 hours'),
('mercado_livre', 'MLB-Q-12345685', 'MLB-4829173656', 'Mixing Glass 500ml', 'Pode usar pra servir suco também ou só coquetel?', NULL, 'DRINK_LOVER', 'ai_suggested', 'Claro! O Mixing Glass é versátil e pode ser usado para preparar e servir qualquer tipo de bebida, incluindo sucos e drinks sem álcool.', NULL, NULL, now() - interval '8 hours'),
('shopee', 'SHP-Q-987654', 'SHP-ITM-112233', 'Pote Hermético Vidro 1520ml', 'Posso usar pra guardar grãos e cereais?', NULL, 'mariafernanda_fit', 'ai_suggested', 'Sim! O Pote Hermético é perfeito para armazenar grãos, cereais, farinhas e outros alimentos secos. A vedação mantém tudo fresquinho por muito mais tempo!', NULL, NULL, now() - interval '4 hours'),
('shopee', 'SHP-Q-987655', 'SHP-ITM-112234', 'Dosador Pourer Inox', 'Esse dosador serve em garrafa de azeite?', NULL, 'chef.carlos', 'unanswered', NULL, NULL, NULL, now() - interval '7 hours'),
('shopee', 'SHP-Q-987656', 'SHP-ITM-112235', 'Peneira Hawthorne', 'Essa peneira filtra bem gelo picado?', 'Sim, a Peneira Hawthorne foi projetada exatamente para coar gelo e ingredientes sólidos. Funciona perfeitamente!', 'bar_em_casa', 'answered', NULL, 'human', now() - interval '1 day 2 hours', now() - interval '1 day 5 hours'),
('shopee', 'SHP-Q-987657', 'SHP-ITM-112236', 'Muddler Madeira', 'De qual madeira é feito? É tratada?', NULL, 'lucas.barman', 'unanswered', NULL, NULL, NULL, now() - interval '9 hours'),
('shopee', 'SHP-Q-987658', 'SHP-ITM-112237', 'Bar Spoon Trident', 'Qual o comprimento total da colher?', NULL, 'shopee_user_8821', 'unanswered', NULL, NULL, NULL, now() - interval '11 hours'),
('shopee', 'SHP-Q-987659', 'SHP-ITM-112238', 'Jigger Duplo Inox', 'As medidas são 30/60ml ou 25/50ml?', NULL, 'drinkmaker_sp', 'ai_suggested', 'Olá! O Jigger Duplo Inox possui medidas de 30ml e 60ml, padrão profissional de bartender. Ótima escolha!', NULL, NULL, now() - interval '14 hours'),
('shopee', 'SHP-Q-987660', 'SHP-ITM-112239', 'Coqueteleira Profissional 750ml', 'Essa coqueteleira é a de 3 peças (com coador)?', 'Sim! É o modelo 3 peças: copo, coador embutido e tampa. Aço inox 304 de alta qualidade.', 'amanda.festas', 'answered', NULL, 'ai_agent', now() - interval '2 days', now() - interval '2 days 3 hours'),
('amazon', 'AMZ-Q-A1B2C3D4', 'AMZ-ASIN-B0CXY12345', 'Kit Bartender 12 Peças', 'Vem com estojo/maleta para guardar?', NULL, 'Ricardo M.', 'unanswered', NULL, NULL, NULL, now() - interval '16 hours'),
('amazon', 'AMZ-Q-A1B2C3D5', 'AMZ-ASIN-B0CXY12346', 'Balde de Gelo Inox 3L', 'A pinça já vem inclusa ou compra separado?', 'A pinça de gelo em aço inox já está inclusa no kit! Pronta para usar.', 'Fernanda C.', 'answered', NULL, 'human', now() - interval '1 day 8 hours', now() - interval '2 days'),
('amazon', 'AMZ-Q-A1B2C3D6', 'AMZ-ASIN-B0CXY12347', 'Conjunto 5 Potes Herméticos', 'Quais são os tamanhos de cada pote do conjunto?', NULL, 'CasaOrganizada', 'ai_suggested', 'O Conjunto inclui 5 tamanhos: 370ml, 640ml, 1050ml, 1520ml e 2100ml. Perfeitos para organizar sua cozinha do menor ao maior!', NULL, NULL, now() - interval '18 hours'),
('amazon', 'AMZ-Q-A1B2C3D7', 'AMZ-ASIN-B0CXY12345', 'Pote Hermético Vidro 1520ml', 'O vidro é borossilicato ou vidro comum?', NULL, 'Chef Paulo', 'unanswered', NULL, NULL, NULL, now() - interval '20 hours'),
('amazon', 'AMZ-Q-A1B2C3D8', 'AMZ-ASIN-B0CXY12348', 'Coqueteleira Profissional 750ml', 'Pode lavar na lava-louças?', 'Recomendamos lavar à mão para manter o acabamento. Lava-louças pode danificar o polimento do inox com o tempo.', 'BebidaFina', 'answered', NULL, 'human', now() - interval '2 days 12 hours', now() - interval '3 days');

-- Seed marketplace_chats (10 chats)
INSERT INTO public.marketplace_chats (id, platform, platform_conversation_id, buyer_nickname, order_id, product_name, status, last_message_preview, unread_count, created_at, updated_at) VALUES
('a0000001-0000-0000-0000-000000000001', 'shopee', 'SHP-CHAT-20241128-001', 'patricia.souza', 'SHP-ORD-2024112801', 'Coqueteleira Profissional 750ml', 'active', 'Ok, aguardo o código. Obrigada pela agilidade!', 2, now() - interval '2 days', now() - interval '1 hour'),
('a0000001-0000-0000-0000-000000000002', 'shopee', 'SHP-CHAT-20241130-002', 'marcos_chef', NULL, 'Kit Bartender 12 Peças', 'waiting', 'Marcos, boa notícia! Para compras acima de 3 unidades conseguimos oferecer 10% de desconto.', 1, now() - interval '1 day 12 hours', now() - interval '3 hours'),
('a0000001-0000-0000-0000-000000000003', 'shopee', 'SHP-CHAT-20241205-003', 'julia.organiza', 'SHP-ORD-2024120502', 'Conjunto 5 Potes Herméticos', 'resolved', 'Obrigada! Vou aguardar então 😊', 0, now() - interval '3 days', now() - interval '1 day'),
('a0000001-0000-0000-0000-000000000004', 'shopee', 'SHP-CHAT-20241207-004', 'bar_do_ze', NULL, 'Balde de Gelo Inox 3L', 'active', 'Cabe aproximadamente 2kg de gelo em cubos, o que dá pra umas 15-20 doses tranquilamente.', 0, now() - interval '1 day', now() - interval '5 hours'),
('a0000001-0000-0000-0000-000000000005', 'shopee', 'SHP-CHAT-20241209-005', 'carol.mixologia', 'SHP-ORD-2024120901', 'Jigger Duplo Inox', 'resolved', 'Com certeza vou avaliar! Já tô de olho no kit completo haha', 0, now() - interval '2 days', now() - interval '12 hours'),
('a0000001-0000-0000-0000-000000000006', 'amazon', 'AMZ-CHAT-114-7832945', 'Roberto A.', 'AMZ-114-7832945', 'Pote Hermético Vidro 1520ml', 'active', 'Ah, mas tenho outra dúvida: posso colocar líquidos quentes dentro?', 1, now() - interval '1 day 6 hours', now() - interval '2 hours'),
('a0000001-0000-0000-0000-000000000007', 'amazon', 'AMZ-CHAT-114-8856321', 'Camila F.', NULL, 'Muddler Madeira', 'waiting', 'E qual o tamanho dele? Quero ter certeza que cabe no meu copo', 1, now() - interval '18 hours', now() - interval '4 hours'),
('a0000001-0000-0000-0000-000000000008', 'amazon', 'AMZ-CHAT-114-9945621', 'André S.', 'AMZ-114-9945621', 'Kit Bartender 12 Peças', 'resolved', 'Confirmado, vamos enviar o dosador separadamente sem custo.', 0, now() - interval '3 days', now() - interval '2 days'),
('a0000001-0000-0000-0000-000000000009', 'mercado_livre', 'ML-CHAT-2024-87654321', 'THIAGO_DRINKS', 'ML-2024-87654321', 'Mixing Glass 500ml', 'active', 'Ah, e outra coisa: o vidro é temperado?', 3, now() - interval '2 days 6 hours', now() - interval '30 minutes'),
('a0000001-0000-0000-0000-000000000010', 'mercado_livre', 'ML-CHAT-2024-99887766', 'CASA_COMPLETA', NULL, 'Conjunto 5 Potes Herméticos', 'waiting', 'Parcelamos em até 12x sem juros no cartão de crédito!', 1, now() - interval '1 day 3 hours', now() - interval '6 hours');

-- Seed marketplace_chat_messages
-- Chat 1 (patricia.souza - Shopee)
INSERT INTO public.marketplace_chat_messages (chat_id, role, content, created_at) VALUES
('a0000001-0000-0000-0000-000000000001', 'buyer', 'Oi, recebi minha coqueteleira mas veio com um amassado na lateral', now() - interval '2 days'),
('a0000001-0000-0000-0000-000000000001', 'seller', 'Oi Patricia! Lamento muito pelo inconveniente. Pode nos enviar uma foto do amassado?', now() - interval '1 day 23 hours'),
('a0000001-0000-0000-0000-000000000001', 'buyer', 'Acabei de enviar a foto. Tá bem visível o amassado', now() - interval '1 day 22 hours'),
('a0000001-0000-0000-0000-000000000001', 'seller', 'Obrigado pela foto. Vamos providenciar a troca imediatamente. Vou gerar o código de devolução.', now() - interval '1 day 21 hours'),
('a0000001-0000-0000-0000-000000000001', 'buyer', 'Ok, aguardo o código. Obrigada pela agilidade!', now() - interval '1 hour');

-- Chat 2 (marcos_chef - Shopee)
INSERT INTO public.marketplace_chat_messages (chat_id, role, content, ai_suggested, created_at) VALUES
('a0000001-0000-0000-0000-000000000002', 'buyer', 'Boa tarde! Vocês fazem preço especial pra compra de 5 kits? É pra dar de presente pros meus padrinhos', false, now() - interval '1 day 12 hours'),
('a0000001-0000-0000-0000-000000000002', 'seller', 'Boa tarde Marcos! Que ideia legal! Deixa eu verificar com o comercial sobre condição especial para 5 unidades.', false, now() - interval '1 day 11 hours'),
('a0000001-0000-0000-0000-000000000002', 'buyer', 'Beleza, fico no aguardo! O casamento é mês que vem então preciso de uma resposta rápida hehe', false, now() - interval '1 day 10 hours'),
('a0000001-0000-0000-0000-000000000002', 'ai_agent', 'Marcos, boa notícia! Para compras acima de 3 unidades conseguimos oferecer 10% de desconto. Posso gerar um link especial para você?', true, now() - interval '3 hours');

-- Chat 3 (julia.organiza - Shopee)
INSERT INTO public.marketplace_chat_messages (chat_id, role, content, created_at) VALUES
('a0000001-0000-0000-0000-000000000003', 'buyer', 'Oi! Meu pedido tá parado no rastreamento faz 3 dias. Número: SHP2024120502BR', now() - interval '3 days'),
('a0000001-0000-0000-0000-000000000003', 'seller', 'Olá Julia! Acabei de verificar e seu pedido está no centro de distribuição da Shopee em Osasco. Previsão de entrega atualizada: até sexta-feira.', now() - interval '2 days 22 hours'),
('a0000001-0000-0000-0000-000000000003', 'buyer', 'Obrigada! Vou aguardar então 😊', now() - interval '2 days 21 hours');

-- Chat 4 (bar_do_ze - Shopee)
INSERT INTO public.marketplace_chat_messages (chat_id, role, content, created_at) VALUES
('a0000001-0000-0000-0000-000000000004', 'buyer', 'Esse balde é de inox mesmo ou só revestido?', now() - interval '1 day'),
('a0000001-0000-0000-0000-000000000004', 'seller', 'É aço inox 304 legítimo, tanto o corpo quanto a alça! Bem resistente.', now() - interval '23 hours'),
('a0000001-0000-0000-0000-000000000004', 'buyer', 'Massa. E cabe quantos cubos de gelo mais ou menos?', now() - interval '22 hours'),
('a0000001-0000-0000-0000-000000000004', 'seller', 'Cabe aproximadamente 2kg de gelo em cubos, o que dá pra umas 15-20 doses tranquilamente.', now() - interval '5 hours');

-- Chat 5 (carol.mixologia - Shopee)
INSERT INTO public.marketplace_chat_messages (chat_id, role, content, created_at) VALUES
('a0000001-0000-0000-0000-000000000005', 'buyer', 'Só passando pra dizer que o jigger é LINDO, qualidade incrível! Amei 😍', now() - interval '2 days'),
('a0000001-0000-0000-0000-000000000005', 'seller', 'Que felicidade saber disso Carol! Ficamos muito contentes que gostou! Se puder deixar uma avaliação na Shopee, ajuda demais 🙏', now() - interval '1 day 20 hours'),
('a0000001-0000-0000-0000-000000000005', 'buyer', 'Com certeza vou avaliar! Já tô de olho no kit completo haha', now() - interval '12 hours');

-- Chat 6 (Roberto A. - Amazon)
INSERT INTO public.marketplace_chat_messages (chat_id, role, content, created_at) VALUES
('a0000001-0000-0000-0000-000000000006', 'buyer', 'A tampa do pote não está vedando direito. Quando viro de cabeça pra baixo, vaza um pouco.', now() - interval '1 day 6 hours'),
('a0000001-0000-0000-0000-000000000006', 'seller', 'Olá Roberto! Isso pode acontecer se a borracha de vedação não estiver encaixada corretamente. Pode verificar se a borrachinha da tampa está bem posicionada?', now() - interval '1 day 5 hours'),
('a0000001-0000-0000-0000-000000000006', 'buyer', 'Verifiquei aqui e realmente estava fora do lugar. Encaixei direito e parou de vazar!', now() - interval '1 day 4 hours'),
('a0000001-0000-0000-0000-000000000006', 'buyer', 'Ah, mas tenho outra dúvida: posso colocar líquidos quentes dentro?', now() - interval '2 hours');

-- Chat 7 (Camila F. - Amazon)
INSERT INTO public.marketplace_chat_messages (chat_id, role, content, created_at) VALUES
('a0000001-0000-0000-0000-000000000007', 'buyer', 'Esse muddler serve pra caipirinha? Preciso de um que não absorva cheiro do limão', now() - interval '18 hours'),
('a0000001-0000-0000-0000-000000000007', 'seller', 'Oi Camila! O Muddler é de madeira tratada, não absorve cheiro nem sabor. Perfeito para caipirinhas!', now() - interval '17 hours'),
('a0000001-0000-0000-0000-000000000007', 'buyer', 'E qual o tamanho dele? Quero ter certeza que cabe no meu copo', now() - interval '4 hours');

-- Chat 8 (André S. - Amazon)
INSERT INTO public.marketplace_chat_messages (chat_id, role, content, created_at) VALUES
('a0000001-0000-0000-0000-000000000008', 'buyer', 'Recebi o kit mas a lista de peças não confere. Faltou o dosador.', now() - interval '3 days'),
('a0000001-0000-0000-0000-000000000008', 'seller', 'Olá André! Pedimos desculpas pelo inconveniente. Pode nos enviar uma foto do conteúdo que recebeu?', now() - interval '2 days 23 hours'),
('a0000001-0000-0000-0000-000000000008', 'buyer', 'Enviei as fotos. Contei 11 peças, falta o dosador pourer.', now() - interval '2 days 22 hours'),
('a0000001-0000-0000-0000-000000000008', 'seller', 'Confirmado, vamos enviar o dosador separadamente sem custo. Código de rastreio será enviado em até 24h. Desculpe pelo transtorno!', now() - interval '2 days');

-- Chat 9 (THIAGO_DRINKS - Mercado Livre)
INSERT INTO public.marketplace_chat_messages (chat_id, role, content, created_at) VALUES
('a0000001-0000-0000-0000-000000000009', 'buyer', 'Comprei o mixing glass mas queria trocar por um de 700ml. Tem como?', now() - interval '2 days 6 hours'),
('a0000001-0000-0000-0000-000000000009', 'seller', 'Olá Thiago! Infelizmente não temos o modelo de 700ml no momento. Podemos oferecer o reembolso ou um cupom de desconto pra próxima compra.', now() - interval '2 days 5 hours'),
('a0000001-0000-0000-0000-000000000009', 'buyer', 'Hmm, mas vocês não vão lançar o de 700ml?', now() - interval '2 days 4 hours'),
('a0000001-0000-0000-0000-000000000009', 'seller', 'Está nos planos para o próximo trimestre! Se preferir, posso te avisar quando estiver disponível.', now() - interval '2 days 3 hours'),
('a0000001-0000-0000-0000-000000000009', 'buyer', 'Tá bom, vou ficar com esse mesmo então. Mas me avisa quando lançar o maior!', now() - interval '1 hour'),
('a0000001-0000-0000-0000-000000000009', 'buyer', 'Ah, e outra coisa: o vidro é temperado?', now() - interval '30 minutes');

-- Chat 10 (CASA_COMPLETA - Mercado Livre)
INSERT INTO public.marketplace_chat_messages (chat_id, role, content, ai_suggested, created_at) VALUES
('a0000001-0000-0000-0000-000000000010', 'buyer', 'Boa noite! Vi que vocês vendem os potes avulsos também. Qual o preço do de 2100ml separado?', false, now() - interval '1 day 3 hours'),
('a0000001-0000-0000-0000-000000000010', 'seller', 'Boa noite! O pote de 2100ml avulso está R$ 49,90. Mas o conjunto de 5 está R$ 179,90, o que dá um desconto de quase 30% no total.', false, now() - interval '1 day 2 hours'),
('a0000001-0000-0000-0000-000000000010', 'buyer', 'Entendi, faz sentido levar o conjunto. E vocês parcelam em quantas vezes?', false, now() - interval '1 day 1 hour'),
('a0000001-0000-0000-0000-000000000010', 'ai_agent', 'Parcelamos em até 12x sem juros no cartão de crédito! E para pagamento via Pix, oferecemos 5% de desconto adicional. Posso ajudar com mais alguma dúvida?', true, now() - interval '6 hours');
