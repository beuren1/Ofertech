# Preparação para o lançamento comercial no Brasil

## Decisão de liberação

**Ainda não liberar cobrança comercial.** Em 27 de novembro de 2026, a home da Vercel respondeu HTTP 200 com TLS verificado. `/api/plans/` respondeu HTTP 200 diretamente no Render e HTTP 404 via Vercel. A rota `/api/health/` retornou 404 nos dois endereços consultados. O preflight do login direto no Render aceitou a origem da Vercel com credenciais. Esses resultados não confirmam a revisão servida, a retenção dos cookies pelo proxy ou a configuração do PostgreSQL e da mídia. Nenhum painel privado, banco de produção ou conta financeira foi acessado.

O repositório local contém os geradores, projetos isolados por proprietário, autenticação JWT, recuperação de senha, histórico de créditos, cobrança por operação confirmada e uma integração **de teste** para assinaturas. O catálogo consultado diretamente no Render confirmou Grátis R$ 0 e 10 créditos, Pro R$ 19,99 e 200 créditos, Business R$ 39,99 e 1.000 créditos, por mês.

### Regras comerciais conferidas no código

| Operação | Grátis | Pro e Business |
| --- | ---: | ---: |
| Banner, inclusive geração em massa, por arte | 1 | 1 |
| Story por arte | 1 | 1 |
| Encarte ou cardápio por página | 2 | 2 |
| Cartaz por página ou etiquetas por folha | 2 | 1 |
| Vídeo por exportação | 2 | 5 |
| Remoção de fundo por recorte confirmado | 1 | 1 |
| Reprodução pelo link da TV de Ofertas | 0 | 0 |

O backend aplica permissões de formato, recursos e quantidade e confirma os débitos no saldo compartilhado. JPG, PDF e Oferta Profissional exigem plano pago. Os limites de identidades de loja são 1, 3 e 10. O backend autoriza até 5, 50 e 1.000 unidades por operação, respectivamente. O editor de banners em massa limita o Business a 100 por lote, além dos limites próprios de outros editores. A renovação e os ajustes usam operações identificadas e protegidas por restrição única e transação.

## Produção e armazenamento

| Componente | Verificar no ambiente |
| --- | --- |
| Vercel | Raiz `frontend`, build Vite, rewrite `/api/*` para o serviço Render correto, fallback SPA e `VITE_API_URL` relativo a `/api` ou ausente para usar o padrão do build. Nenhum segredo em variáveis `VITE_*`. |
| Render | Raiz `backend`, `DJANGO_DEBUG=False`, hosts explícitos, `DJANGO_SECRET_KEY` no cofre, `DATABASE_URL` apontando ao PostgreSQL permanente e `DJANGO_CORS_ALLOWED_ORIGINS` com a origem HTTPS exata. Revisar `migrate --plan` antes da troca e manter `sh start-render.sh`. |
| Mídia | No Render use S3 privado e siga o [guia de R2](render-free-r2.md). O modo filesystem fica disponível no desenvolvimento local. |
| E-mail | Validar SMTP, domínio e remetente. Definir `DJANGO_PASSWORD_RESET_URL` na origem pública e manter `process_password_reset_emails` em worker ou agendamento separado. |
| Disponibilidade | Monitorar `/api/health/` direto no Render e pelo domínio da Vercel, exigindo HTTP 200 e JSON `status=ok`. Monitorar também `/api/plans/`, erros HTTP 5xx, latência, filas e uso do disco. Nomear responsáveis pelos alertas. |

A checagem de saúde local verifica o banco. Ela não verifica a entrega de e-mail nem a existência das fotos. Fotos de campanha, miniaturas e logotipos com referência a arquivo precisam do backup de mídia. Projetos que usam URLs externas também dependem de a origem continuar disponível. Rascunhos que ainda não foram salvos podem depender do navegador. Consulte [Render PostgreSQL](https://render.com/docs/postgresql-backups), [discos do Render](https://render.com/docs/disks) e [rewrites da Vercel](https://vercel.com/docs/routing/rewrites).

### Exercício de recuperação em homologação

1. Defina prazo de retenção, intervalo máximo de perda aceitável, tempo de recuperação e responsável. Registre a revisão da aplicação e o horário do par banco/mídia.
2. Gere um backup lógico privado do PostgreSQL pelo painel Render ou com `pg_dump --format=custom --file=ofertech.dump` usando um serviço PostgreSQL configurado fora do repositório. Preserve também as opções de recuperação oferecidas pelo plano. Copie a mídia para armazenamento separado e criptografado, mantendo caminhos relativos e checksums. Para um ponto de corte consistente, suspenda gravações durante a cópia coordenada ou use o procedimento de snapshots validado para ambos os armazenamentos.
3. Restaure em **banco novo e isolado**, com `pg_restore --exit-on-error --no-owner --dbname=ofertech_restore ofertech.dump`, e em uma cópia separada da mídia. Isole a rede e os acessos. Use `MP_MODE=off`, backend de e-mail sem envio e desative workers externos durante o exercício. Não aponte comandos de restauração para o banco ativo.
4. Compare contagens de usuários, projetos, transações e arquivos e confira amostras de saldos e histórico. Rode `python manage.py audit_media` e valide uma exportação, o isolamento entre usuários e a abertura das fotos depois de reiniciar o serviço. Registre resultado e duração.

## Segurança, privacidade e segredos

- A revisão cobriu a árvore versionada, dez commits locais e 13 bundles JavaScript públicos. O HEAD inicial correspondia ao `main` remoto. A busca por nomes de arquivos sensíveis e assinaturas comuns não listou correspondências. Isso não cobre objetos inacessíveis, forks, logs, variáveis dos provedores ou todos os tipos de segredo.
- Confirme origem da sessão, configuração de IP do proxy confiável, cookies seguros, isolamento entre usuários e acesso administrativo com contas de homologação. Limites de autenticação ficam no banco compartilhado. O cadastro recebeu limite por IP. Se o proxy não encaminhar um IP confiável, vários visitantes podem compartilhar a mesma cota. Valide o cabeçalho antes de abrir tráfego público.
- Limite tamanho e frequência de uploads e monitore 429, 5xx e esgotamento do disco. Teste exportação de vídeo pelo caminho Vercel → Render com os tamanhos esperados.
- Os logs do provedor usam status e categorias permitidas. Mantenha cabeçalhos de autenticação, tokens de links, dados pessoais e payloads fora dos logs e ferramentas de erro. Em incidente confirmado, a rotação de credenciais e a análise das notificações cabem ao responsável autorizado.
- Preencha razão social, CNPJ, endereço, e-mails de suporte e privacidade, horários e prazos, responsável pelo tratamento, operadores, regiões, critérios de retenção e procedimento de verificação de identidade. Valide os textos legais antes de publicar e defina o fluxo fiscal aplicável. As páginas em revisão não apresentam dados empresariais inventados. Consulte o [CDC](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm), o [Decreto do comércio eletrônico](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm) e os [direitos do titular na ANPD](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares).

## Assinaturas e liberação futura do Mercado Pago

- `MP_MODE=test` mantém a verificação da conta vendedora com tag `test_user` e exige o e-mail do comprador fictício. `MP_MODE=off` desabilita a integração, incluindo consultas e cancelamentos remotos. Antes de mudar um ambiente que já contém assinaturas de teste, confira o estado dessas assinaturas e preserve o histórico. A configuração comercial ainda é rejeitada explicitamente.
- O **403 anterior segue sem causa confirmada**. Em homologação, obtenha o status, a etapa (`GET /users/me` ou `POST /preapproval`), a categoria sanitizada, horário e identificador de solicitação fornecido pelo provedor. Confirme aplicação e país BR, vendedor de teste correspondente à credencial, comprador fictício distinto, permissões para assinaturas e URLs HTTPS. Se o provedor retornar bloqueio por política, envie ao suporte apenas os identificadores e dados redigidos. As validações locais devem continuar habilitadas.
- O backend valida assinatura HMAC, relacionamento com a assinatura, vendedor, moeda, periodicidade, valor e situação do pagamento consultada no provedor. Abrir a página de retorno ou autorizar a assinatura não confirma parcela paga. Chaves e restrições únicas impedem crédito duplicado. Se o envio inicial tiver resultado incerto, o fluxo busca a referência existente antes de tentar criar outra assinatura.
- `python manage.py reconcile_subscription ID_LOCAL` mostra um resumo local. Em **homologação**, `--apply` consulta a API de teste e reaplica apenas transições verificadas. Selecione uma parcela descoberta no provedor com `--invoice ID_DA_PARCELA`; sem opção, o comando verifica até 25 parcelas conhecidas. A operação não cria cobrança nem faz reembolso no Mercado Pago. Reparos são por assinatura e podem ser repetidos; se uma parcela falhar, as anteriores já confirmadas permanecem registradas.
- Recusas ficam no histórico. Cancelamento precisa ser confirmado no provedor e mantém o período já pago. Notificações assinadas sobre pagamentos já vinculados atualizam o estado de estorno e contestação. A conciliação não subtrai créditos retroativamente nem inicia reembolso monetário. Defina o procedimento de análise, cobrança contestada, estorno parcial, ajustes de saldo e atendimento antes da venda. A troca de plano preserva o fluxo atual de cancelar a assinatura aberta e contratar outra, sem cálculo automático de proporcionalidade.
- Para liberar produção, finalize o cadastro da conta comercial no Mercado Pago e confirme a disponibilidade de Assinaturas na aplicação BR. Faça ambientes isolados, com banco, credencial, segredo de webhook e configuração próprios. Antes de aceitar tokens comerciais, implemente e teste a identificação explícita do ambiente nos dados de cobrança, o vendedor comercial verificado, o pagador real e a política de trocas e estornos. Cadastre e teste os tópicos `subscription_preapproval`, `subscription_authorized_payment` e `payment`, cobrindo repetição, atrasos, eventos fora de ordem e reprocessamento de parcelas faltantes. A aprovação do responsável pela conta deve preceder qualquer cobrança real.

Referências do provedor. [Credenciais](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/credentials), [API de assinaturas](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/overview), [webhooks](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/introduction) e [gerenciamento](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/subscription-management).

## Mensagens transacionais

Rascunhos para revisão. Use remetente verificado e canal oficial. A recuperação já tem template e fila. Os outros textos aguardam configuração, eventos e integração com uma fila persistente com chave única por evento, antes de enviar qualquer mensagem.

| Evento | Assunto | Texto preliminar |
| --- | --- | --- |
| Cadastro concluído | Bem-vindo à Ofertech | Sua conta está pronta. Escolha um exemplo em Modelos e personalize sua primeira arte. |
| Solicitação de recuperação | Redefina sua senha da Ofertech | Use o link seguro de redefinição dentro do prazo exibido. Se você não solicitou a alteração, ignore este e-mail. |
| Parcela confirmada e aplicada | Pagamento confirmado | Seu pagamento do plano {plano} foi confirmado. Consulte a cota e a data do ciclo em Planos e créditos. |
| Parcela recusada pelo provedor | Seu pagamento não foi confirmado | Abra Planos e créditos e verifique a situação da assinatura. Confira o meio de pagamento no canal oficial do provedor. |
| Cancelamento confirmado pelo provedor | Assinatura cancelada | A renovação foi cancelada. Se houver um ciclo pago vigente, consulte a data final de acesso no painel. |

## Checklist antes da abertura para clientes

- [ ] Confirmar revisão publicada, corrigir os dois 404 públicos e validar catálogo, login, origens, cookies e arquivos estáticos.
- [ ] Confirmar PostgreSQL e mídia persistente no Render. Restaurar ambos em ambiente isolado e testar após reinício.
- [ ] Verificar acesso administrativo, logs, limites de autenticação, uploads e fronteiras entre contas.
- [ ] Validar preços, cotas, exportações, pagamento recusado, cancelamento, estorno e conciliação no ambiente de teste.
- [ ] Fechar separação de ambientes e validar as credenciais e a aplicação comercial no Mercado Pago. Aprovação explícita antes de habilitar a primeira cobrança.
- [ ] Completar e revisar Termos, Privacidade, reembolsos, exclusão de conta e atendimento. Testar os canais com uma solicitação real de homologação.
- [ ] Confirmar remetente e fila SMTP. Ativar apenas mensagens cuja origem e idempotência tenham sido verificadas.
- [ ] Validar monitoramento, alertas, retenção, restauração e responsáveis pelo atendimento. Aprovar a liberação em uma janela controlada.

## Alterações locais

- Páginas públicas preliminares, links no rodapé e nas configurações, FAQ, transparência de custos e exemplos por segmento na home. Os textos de e-mail nesta documentação ainda são rascunhos, com exceção da recuperação de senha já integrada ao Django.
- Limite de cadastro por IP, respostas privadas de cobrança sem cache, disponibilização do checkout só à conta compradora fictícia, modo desligado e logs discriminando a etapa de validação do vendedor e de criação da assinatura.
- Comandos de auditoria de mídia e reconciliação, com testes de ausência de arquivos, repetição de ciclos e notificações de estorno. Nenhuma migração nova foi necessária.

## Validação executada

- **101 testes do frontend e 74 do Django** passaram, incluindo autenticação, recuperação de senha, limites, proprietários, exportações, renovação, cancelamento, estorno e repetição de notificações.
- A checagem do TypeScript e o build Vite passaram. `makemigrations --check --dry-run` não detectou alterações de esquema.
- Um exercício isolado copiou um banco SQLite e seu diretório de mídia. Em outro processo Django, a cópia preservou o proprietário do projeto, os bytes do arquivo, o saldo e o histórico de créditos. A auditoria encontrou zero arquivos ausentes nessa cópia. A recuperação do PostgreSQL e da mídia do Render continua pendente em homologação.
