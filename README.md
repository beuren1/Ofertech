# Ofertech

**Sua oferta merece destaque.**

A Ofertech permite criar, editar e salvar banners, encartes, cartazes, etiquetas e campanhas promocionais.

## Planos e créditos

O Django é a fonte de permissões e cotas dos planos. No Grátis, os 10
créditos mensais são compartilhados entre os geradores. Banners individuais
e em massa custam 1 crédito por arte. Encartes, cartazes e etiquetas custam
2 por página ou folha, e vídeos custam 2 por exportação. No Pro e no Business,
encartes custam 2 por página, cartazes e etiquetas custam 1 por página ou folha,
e vídeos custam 5 por exportação. A remoção de fundo custa 1 crédito por recorte
concluído em todos os planos.
Pro e Business incluem JPG, PDF e o template
Oferta Profissional. A gravação em MP4 depende do navegador. Nos lotes de
banners no editor, os limites são de 5 artes no Grátis, 50 no Pro e 100 no
Business. A API mantém o limite geral de 1.000 unidades por operação no Business.

O editor consulta o saldo antes de processar. A confirmação envia o arquivo
concluído para conferência de formato e registro do consumo, sem armazenar
esse arquivo na conta. A transação usa a assinatura e um identificador
único de operação para serializar o débito e evitar repetições.
Os cálculos de imagem e vídeo continuam em Canvas no navegador.

### Equipes Business

A etapa atual mantém campanhas, projetos, arquivos e identidades visuais
restritos ao proprietário. O próximo passo é associar membros a lojas
específicas com papéis de leitura e edição, convites com validade e revogação.
O acesso compartilhado precisa usar a mesma verificação por loja nas campanhas,
nos projetos e no conteúdo dos arquivos. A assinatura, os pagamentos e o
convite de novos membros ficam sob controle do proprietário. O limite de
cinco membros deve ser verificado na aceitação do convite em transação.
Nenhum benefício de equipe está disponível nesta etapa.

### Oferta Profissional

Em **Criar promoção** ou **Criação em massa**, selecione **Oferta Profissional**
na seção **Template**. Escolha 1080 × 1080, 1080 × 1350 ou 1080 × 1920 e baixe
em PNG ou JPG. Na criação em massa, é possível aplicar o template a todas as
artes e exportar o lote em ZIP. As configurações ficam na campanha salva.

Para fotos JPG ou outras imagens com fundo, abra **Remover fundo**, marque
as partes que deseja manter ou remover e gere a prévia. A foto original
continua na arte até aplicar o recorte. PNG e WebP já transparentes podem
ser usados diretamente e conservam a resolução de origem.

O recorte usa GrabCut do OpenCV.js em um Web Worker. O navegador carrega
o módulo WebAssembly na primeira prévia e calcula o recorte localmente com
até 720 pixels no lado maior. O recorte pode demorar em dispositivos mais
lentos e precisar de marcações adicionais, especialmente quando o fundo e
o produto têm tons semelhantes. Para aproveitar toda a resolução de um
produto com bordas finas ou sem contraste, use PNG ou WebP já recortado.

## Structure

- `frontend/`: React, TypeScript, Vite, Tailwind CSS and browser Canvas generation
- `backend/`: Django, Django REST Framework and JWT authentication

The application includes authenticated campaign persistence, local file-based storage and Mercado Pago integration restricted to test accounts.

## Versões do backend

O ambiente local foi validado com Python **3.14.10**, Django **5.2.19 LTS**,
Django REST Framework **3.18.3** e Simple JWT **5.5.1**. As versões desses
três pacotes estão fixadas em `backend/requirements.txt`.

Em uma instalação existente, faça uma cópia consistente do SQLite e verifique
sua integridade antes de atualizar as dependências. Depois de instalar o
`requirements.txt`, execute `python -m pip check` e, dentro de `backend`,
revise `python manage.py migrate --plan` antes de aplicar migrações pendentes.
O Simple JWT 5.5.1 inclui a migração
`token_blacklist.0013_alter_blacklistedtoken_options_and_more`, que ajusta
metadados dos modelos. Guarde o backup em um local privado.
Mantenha o banco, as contas administrativas e os arquivos `.env` já configurados.

## Windows setup

Install Node.js 20+ and Python 3.11+ first. Then, in PowerShell:

```powershell
cd "C:\Users\josue\Desktop\New folder"

# Frontend
cd frontend
npm install
copy .env.example .env
npm run dev

# Backend (second terminal)
cd "C:\Users\josue\Desktop\New folder"
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r backend\requirements.txt
copy backend\.env.example backend\.env
python -c "from django.utils.crypto import get_random_string; from dotenv import set_key; set_key('backend/.env', 'DJANGO_SECRET_KEY', get_random_string(64))"
cd backend
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Open `http://localhost:5173`. The API is available at `http://localhost:8000/api/`.

The frontend reads `VITE_API_URL` from the process or `frontend/.env`. Its API
default is `http://localhost:8000/api` in development and `/api` in production.
The backend's default database for local development is
`backend/db.sqlite3`, unless `DATABASE_URL` in `backend/.env` selects another
database. The backend allows the local Vite origins on ports 5173.
Campaign images are stored outside the database under `backend/media` by default.
Set `DJANGO_MEDIA_ROOT` in `backend/.env` to use a different persistent directory.
Keep that directory backed up and private; images are returned through authenticated
campaign asset endpoints.

For a frontend tunnel, set `FRONTEND_TUNNEL_HOST` in `frontend/.env` to the
exact public hostname routed to Vite on port 5173, then restart Vite. Leave it
empty for local development. `VITE_API_URL` is public and is the only project
environment variable passed into the browser. Keep Django and Mercado Pago
credentials in `backend/.env`.

Django reads `backend/.env` with python-dotenv. Variables already set in the
process take precedence. Keep the generated key in that file and reuse it on
restart. The local profile runs over HTTP with `DJANGO_TUNNEL_HOST` unset.

### Cloudflare Tunnel

To keep the local API on port 8000, run a second Django process for the tunnel
with these overrides in a separate PowerShell session, from `backend`:

```powershell
$env:DJANGO_DEBUG = 'False'
$env:DJANGO_TUNNEL_HOST = 'tunnel.example.com'
$env:DJANGO_ALLOWED_HOSTS = $env:DJANGO_TUNNEL_HOST
python manage.py check --deploy
python manage.py runserver 127.0.0.1:8001
```

Replace the example hostname with the public tunnel hostname. Point cloudflared
at `http://127.0.0.1:8001` and preserve the public Host header. Keep the tunnel
listener on loopback, reachable only by trusted processes on the same machine.
Cloudflare overwrites `X-Forwarded-Proto` at its edge. Django accepts it only on
requests from loopback with the configured public Host. This profile enables
HTTPS redirects, secure cookies and HSTS for 300 seconds by default.
Use the Django development server only for this test setup.

### Homologação no Render e na Vercel

No Render, use mídia S3 privada, conforme o [guia de Render Free e R2](docs/render-free-r2.md).

Use um ambiente separado para validar o procedimento antes da publicação.
No Render, configure `backend` como diretório raiz e `python -m pip install -r requirements.txt && python manage.py collectstatic --noinput`
como comando de build. Vincule a URL interna do PostgreSQL em `DATABASE_URL` e
mantenha `DJANGO_DEBUG=False`. O perfil Render é ativado pela variável `RENDER`
da plataforma e inclui `RENDER_EXTERNAL_HOSTNAME` nos hosts permitidos.

- Faça backup do banco e da mídia em local privado e valide a restauração em
  homologação. Se a instância existente usa SQLite, `migrate` cria ou atualiza o
  esquema PostgreSQL. A cópia dos registros para o novo banco exige um procedimento
  separado com conferência de usuários, projetos, relacionamentos, saldo e histórico.
- Preserve os caminhos relativos dos arquivos ao copiar a mídia existente ao R2.
  WhiteNoise serve os arquivos estáticos coletados no build.
- Revise `python manage.py migrate --plan` antes da publicação. Configure
  `sh start-render.sh` no start. Ele verifica o bucket e aplica as migrações
  pendentes antes de iniciar o Gunicorn.
  Configure `/api/health/` como health check. Ele retorna `200` com `status: ok`
  quando o banco responde e `503` com `status: unavailable` quando há falha de banco.
- Configure `frontend` como diretório raiz na Vercel. O domínio público
  `ofertech.vercel.app` usa `/api` na mesma origem, inclusive para rotas com barra
  final, para que o cookie de sessão seja enviado. Cadastre
  a origem HTTPS exata da Vercel em `DJANGO_CORS_ALLOWED_ORIGINS`. Para homologação,
  ajuste o destino do rewrite para o Render de teste e autorize sua origem explícita.
- Confirme no navegador que login, recarregamento e logout usam a mesma origem,
  que o cookie tem `HttpOnly`, `Secure` e `SameSite=Lax`, e que o Render recebe o
  cabeçalho `Origin` nas requisições de sessão. O backend Render exige origem
  confiável para autenticação e redefinição de senha. As APIs privadas usam Bearer.
- Valide uploads e exportações nos tamanhos reais pelo rewrite, inclusive vídeos
  grandes. Salve um projeto com fotos e logo, reinicie o backend e confira se a
  conta proprietária consegue reabri-lo e se outra conta recebe `404` ao tentar
  consultar seus arquivos. Confirme também a entrega de e-mails de recuperação.

Consulte a documentação do [PostgreSQL no Render](https://render.com/docs/deploy-django),
dos [discos persistentes](https://render.com/docs/disks) e dos
[rewrites na Vercel](https://vercel.com/docs/routing/rewrites).

### Authentication

O link **Esqueci minha senha** envia uma solicitação à fila do Django. A resposta
é a mesma para endereços cadastrados, desconhecidos e solicitações limitadas.
O token do Django vence em 30 minutos e perde a validade quando a senha muda.
O código do link fica no fragmento da URL e a redefinição encerra as sessões
anteriores. JWT de acesso dura 30 minutos, e o refresh, 7 dias. Tokens emitidos
antes da implantação da vinculação à senha exigem novo login.

Em desenvolvimento e nos testes, o backend de e-mail padrão usa memória. Para
examinar mensagens entre processos, use
`django.core.mail.backends.filebased.EmailBackend` em `DJANGO_EMAIL_BACKEND`.
Os arquivos ficam na caixa privada `backend/mailbox` ou no caminho definido por
`DJANGO_EMAIL_FILE_PATH`. Eles contêm links de recuperação e devem ser protegidos.

Para envio real, configure no ambiente do processo, sem incluir segredos no
repositório:

| Variável | Configuração |
| --- | --- |
| `DJANGO_EMAIL_BACKEND` | `django.core.mail.backends.smtp.EmailBackend` |
| `DJANGO_EMAIL_HOST`, `DJANGO_EMAIL_PORT` | Servidor e porta SMTP |
| `DJANGO_EMAIL_HOST_USER`, `DJANGO_EMAIL_HOST_PASSWORD` | Credenciais do remetente, se exigidas pelo servidor |
| `DJANGO_EMAIL_USE_TLS` ou `DJANGO_EMAIL_USE_SSL` | Ative apenas a opção exigida pelo servidor |
| `DJANGO_DEFAULT_FROM_EMAIL` | Remetente verificado pelo servidor de e-mail |
| `DJANGO_PASSWORD_RESET_URL` | URL HTTPS pública do frontend terminada em `/reset-password` |

Execute `python manage.py process_password_reset_emails --watch` em um processo
separado com o mesmo ambiente e banco do Django. O comando sem `--watch` faz
uma rodada e pode ser chamado por um agendador existente. Se frontend e API
tiverem origens distintas, inclua a origem HTTPS do frontend em
`DJANGO_CORS_ALLOWED_ORIGINS`. Mantenha-os no mesmo site para que a política
`SameSite=Lax` do cookie de sessão funcione na navegação.

Os limites de autenticação usam o banco compartilhado entre instâncias. Com o
túnel Cloudflare, só a origem local dedicada reconhece `CF-Connecting-IP`. Para
outro proxy, `DJANGO_TRUSTED_AUTH_PROXY_NETWORKS` aceita IPs ou CIDRs dos
proxies que substituem `X-Real-IP` por um valor apurado pelo próprio proxy.

Register and sign in at `/register` and `/login`. Registration saves a Django user
and profile; the e-mail address is also used as the login username. The access JWT
is held only in frontend memory. The refresh JWT is an HttpOnly cookie and is not
stored in localStorage. Private application pages require a valid authenticated
session; signing out revokes the refresh token.

To confirm a newly registered account, create it in the browser, then run:

```powershell
cd "C:\Users\josue\Desktop\New folder\backend"
python manage.py shell
```

In the Django shell:

```python
from django.contrib.auth import get_user_model
User = get_user_model()
print(list(User.objects.values("id", "username", "email")))
```

The new account should appear in this result, with the e-mail address as its
username. `User.objects.get(email="...").check_password("...")` can verify the
password without exposing its stored hash.

### Bulk artwork

The bulk page accepts CSV files with a product column named `produto`, `nome`,
`name`, or `product`; optional `preco`/`price`, `desconto`/`discount`,
`imagem_url`/`imagem`, and `categoria`/`category` columns are included in each design.
Up to 100 products can be generated per batch. Choose a product photo from the CSV
or upload an individual PNG, JPG, or WebP file. Uploaded photos are copied to
campaign storage when saved; the browser's IndexedDB is used only as local staging.
Remote image URLs remain references and must allow browser CORS to be included in
the exported canvas. If an image is unavailable or blocked by CORS, the gallery
shows a warning and the artwork identifies the category illustration used instead.

The editor offers five square 1080 × 1080 layouts, automatic category selection,
a full gallery, multi-selection, per-art editing, and applying shared settings to
the whole batch. Canvas previews and PNG/JPG exports use the same renderer. Download
individual files or selected/all artworks as ZIP. Campaigns can also be created
from the individual editor. The "Visão geral" page lists saved campaigns and
supports renaming, duplication, deletion, and sorting by creation or last edit.
Campaign metadata, artwork configuration, asset references, and thumbnails are
persisted through authenticated `/api/campaigns/` endpoints. A campaign URL opens
the saved editor state on another device; uploaded photos are served through
owner-checked, authenticated endpoints. Existing batch URLs remain supported.

Run `python manage.py migrate` after updating the backend. Campaigns use the
existing Django database and files under `MEDIA_ROOT`; image bytes are not stored
in JSON fields or database rows.

### PostgreSQL

For PostgreSQL, set `DATABASE_URL` in `backend/.env`, for example:

```text
DATABASE_URL=postgresql://promoforge:password@localhost:5432/promoforge
```

## Pix Asaas em sandbox

O Grátis oferece 10 créditos mensais. Cada compra avulsa do Pro (R$ 19,99)
libera 200 créditos e cada compra do Business (R$ 39,99) libera 1.000.
O Django determina o valor e o número de créditos. O plano pago dura 30 dias
no fuso da aplicação, sem renovação automática.

### Configurar a homologação

1. Crie uma conta em [Asaas Sandbox](https://sandbox.asaas.com/) e gere uma
   chave em **Menu do usuário → Integrações → Chaves de API**. Use uma chave
   Pix da própria conta de teste para gerar QR Codes dinâmicos. A documentação
   contempla cobranças Pix de contas pessoa física. A habilitação depende da
   conta e deve ser verificada no painel ou com o Asaas antes de qualquer
   liberação comercial. [Sandbox](https://docs.asaas.com/docs/sandbox) ·
   [Chaves de API](https://docs.asaas.com/docs/chaves-de-api) ·
   [Cobranças Pix](https://docs.asaas.com/docs/cobrancas-via-pix)
2. No **serviço de homologação** do Django no Render, use PostgreSQL e usuários
   de teste próprios. Em **Environment**, configure `ASAAS_ENVIRONMENT=sandbox`,
   `ASAAS_API_KEY` com a chave do sandbox e `ASAAS_WEBHOOK_TOKEN` com um
   segredo aleatório de 32 a 255 caracteres, sem espaços. Use o mesmo token
   no cadastro do webhook. Em execução local, configure as mesmas variáveis
   no `backend/.env`. Mantenha as credenciais no backend. [Variáveis e segredos no Render](https://render.com/docs/configure-environment-variables)
3. Quando publicar manualmente a versão de homologação, execute
   `python manage.py migrate` no backend de teste (o script do Render já
   executa migrações). Configure o frontend de homologação para usar a URL
   desse backend. O padrão `disabled` mantém o checkout Pix desligado.
   O valor `production` também mantém o Pix bloqueado pelo código.
4. No painel **Sandbox** do Asaas, entre em **Integrações → Webhooks** e
   configure `https://<backend-de-homologacao>.onrender.com/api/billing/webhooks/asaas/`
   com API **v3** e o mesmo **Auth Token** do Render. Habilite
   `PAYMENT_CREATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`,
   `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_RESTORED`,
   `PAYMENT_REFUND_IN_PROGRESS`, `PAYMENT_PARTIALLY_REFUNDED`,
   `PAYMENT_REFUNDED` e `PAYMENT_REFUND_DENIED` (além dos eventos de
   contestação, se disponíveis). [Configurar webhook no painel](https://docs.asaas.com/docs/criar-novo-webhook-pela-aplicacao-web) ·
   [Eventos de cobrança](https://docs.asaas.com/docs/webhook-para-cobrancas)

### Fazer o primeiro pagamento simulado

1. Entre na Ofertech de homologação e, em **Planos e créditos**, escolha
   **Pagar com Pix**. Use nome e CPF/CNPJ de teste aceitos pelo Asaas. Verifique
   o valor, o QR Code, o Pix Copia e Cola e o saldo antes da confirmação.
2. No painel do Sandbox, abra a cobrança Pix e selecione **Confirmar pagamento**.
   Quando a conta permitir a operação pela API, use
   `POST https://api-sandbox.asaas.com/v3/sandbox/payment/{id}/confirm`
   com o cabeçalho `access_token` e a chave de teste. Use o identificador
   `pay_...` exibido pelo Asaas. [Simular pelo painel](https://docs.asaas.com/docs/como-adicionar-dinheiro-para-testes) ·
   [Simular pela API](https://docs.asaas.com/reference/confirmar-pagamento)
3. A página consulta periodicamente o estado local. Confira **Pagamento
   aprovado**, a validade e o crédito em **Planos e créditos**. Reenvie o
   mesmo evento pelos logs do Asaas e confira que o saldo permaneceu igual.
   **Consultar no Asaas** permite conciliar pontualmente se o webhook atrasar.
   Uma cobrança `CONFIRMED` fica em processamento até `RECEIVED`. Em contas
   pessoa física, o Asaas documenta que a análise cautelar pode durar até
   72 horas e terminar em recebimento ou estorno. [Estados do Pix](https://docs.asaas.com/reference/criar-nova-cobranca)

### Regras de cobrança e créditos

- Pagamentos confirmados somam os créditos ao saldo vigente. Uma compra
  antecipada do mesmo plano estende a validade por 30 dias. A troca de plano
  vale imediatamente e inicia um período de 30 dias. Ao vencer, o plano
  volta ao Grátis segundo a política de cota mensal existente. O histórico
  de créditos é preservado.
- A integração mantém um pedido em aberto por conta. Se a criação
  ficar inconclusiva após um timeout, **Consultar no Asaas** procura a cobrança
  pela referência `ofertech-pix-<UUID do pedido>`. Se a referência continuar
  ausente no Sandbox, encaminhe o identificador ao suporte para conciliação
  antes de liberar a criação de outra cobrança.
- Estorno parcial ou em processamento fica em análise. O estorno integral
  retira o saldo não consumido daquela compra, considerando os créditos
  mais recentes como os primeiros a serem consumidos. Se a compra estornada
  sustenta o acesso atual, volta a valer um período Pix anterior ainda
  vigente, quando houver. Uma compra posterior conserva a validade já
  concedida se o estorno for de outro pedido.
- Com o Pix disponível, a interface direciona novas compras ao Asaas.
  Assinaturas antigas seguem com seu processamento e cancelamento habituais.
  O checkout Pix fica disponível para essas contas depois do fim da
  assinatura e do acesso pago existente.
- O webhook confirma o token e consulta a cobrança diretamente na API do
  Asaas. O registro de entrega e o movimento de créditos são persistidos
  na mesma transação. Para diagnóstico, compare os identificadores da
  cobrança, do pedido e da entrega nos logs do Sandbox. O banco da
  Ofertech guarda os IDs, valores e estados necessários à conciliação.
  O nome e o documento informados no checkout são encaminhados ao Asaas
  para o cadastro do pagador.

### Diagnosticar falhas na criação do Pix

Nos logs do backend no Render, procure `asaas.request_failed` no horário
da tentativa. A linha identifica `GET /customers` (busca do pagador),
`POST /customers` (cadastro) ou `POST /payments` (emissão), o status HTTP
do Asaas e os códigos técnicos conhecidos. `transport_error` indica falha
de comunicação e `unexpected_customer` indica uma resposta de cadastro ou
busca que não pôde ser vinculada com segurança. O log registra códigos
desconhecidos como `unrecognized_code` e descarta descrições e dados pessoais.

Para `401`, confira no Render a chave ativa do Sandbox, com o prefixo
`$aact_hmlg_` completo e o `$` literal. Para `403`, confira as permissões
e a lista de IPs autorizados da conta Asaas. [Autenticação Asaas](https://docs.asaas.com/docs/autentica%C3%A7%C3%A3o-1) ·
[Códigos HTTP do Asaas](https://docs.asaas.com/reference/codigos-http-das-respostas)

## Mercado Pago em teste

A Ofertech mantém o checkout hospedado de assinaturas no ambiente de teste
quando o Pix está desligado. Os
preços vêm do catálogo Django. A autorização do checkout registra a assinatura,
e os créditos pagos só são liberados depois da confirmação da cobrança recorrente.

1. Em **Suas integrações > Contas de teste**, crie uma conta vendedora e uma
   compradora brasileiras. Entre como a vendedora de teste e crie uma aplicação
   para **Assinaturas**. O [roteiro oficial desse fluxo](https://www.mercadopago.com.br/developers/pt/news/2023/11/16/Questions-on-how-to-test-your-integration--)
   usa o Access Token da seção **Credenciais de produção** da aplicação pertencente
   à vendedora de teste. O backend verifica o ID e a marca de conta de teste do vendedor.
2. Na aplicação da vendedora de teste, abra **Webhooks > Configurar notificações**.
   Cadastre uma URL HTTPS pública terminada em
   `/api/billing/webhooks/mercado-pago/` e selecione **Planos e assinaturas**
   (`subscription_preapproval` e `subscription_authorized_payment`). Use a URL
   do ambiente correspondente à credencial usada pelo checkout e copie a
   assinatura secreta gerada. [Documentação de webhooks](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/resources/notifications/webhooks)
3. Preencha as variáveis abaixo em `backend/.env`, aplique
   `python manage.py migrate` e reinicie o Django. Para um túnel HTTPS, use o
   perfil Cloudflare acima e cadastre a URL pública com a barra final no webhook.
4. Cadastre-se na Ofertech com o e-mail da compradora de teste. Na página
   **Planos**, inicie a assinatura e finalize no Mercado Pago com a conta
   compradora e dados de teste. Confira a atualização após o webhook em
   **Planos > Atualizar situação**.

| Variável | Valor |
| --- | --- |
| `MP_ACCESS_TOKEN` | Access Token da aplicação da vendedora de teste |
| `MP_TEST_SELLER_ID` | User ID da vendedora de teste |
| `MP_TEST_BUYER_EMAIL` | E-mail confirmado na conta compradora de teste, como consta no perfil da conta |
| `MP_WEBHOOK_SECRET` | Assinatura secreta da configuração de webhooks |
| `MP_BACK_URL` | URL HTTPS da página `/plans` do frontend de teste |

Em caso de erro, confira no log do backend se a operação foi `seller_identity`
ou `create_subscription`. A primeira consulta o titular do token e exige
que o ID configurado corresponda ao vendedor de teste. A segunda chama
`POST /preapproval` e registra códigos e campos reconhecidos na rejeição.
Use duas contas de teste brasileiras distintas. Confirme o e-mail no perfil
do comprador e use o mesmo endereço no login da Ofertech.
Se a criação retornar 400 sem campos ou códigos reconhecidos, informe ao
suporte do Mercado Pago o `provider_request_id` (quando presente), o horário
da tentativa, o endpoint `POST /preapproval` e o status HTTP. O identificador
vem do cabeçalho `X-Request-Id` quando tem formato UUID. O log pode indicar
campos citados pelo provedor, que servem como pistas para a investigação.

O cancelamento interrompe as cobranças recorrentes e preserva o saldo do ciclo
já pago até a expiração. Na ausência de uma renovação confirmada, o usuário
volta ao limite Grátis. Para trocar entre planos pagos, cancele a recorrência
atual antes de iniciar a nova.

## Tests

```powershell
cd frontend
npm run test
npm run build

cd ..\backend
python manage.py test
```
## Módulos profissionais

- **Criar Etiquetas** usa o mesmo gerador de impressão de Cartazes. Escolha um tamanho, ajuste as medidas e as margens e imprima em A4 a 100%. No CSV, as colunas opcionais `unidade` (`un`, `kg` ou `l`), `ean13` e `qrcode` preenchem os códigos. Preserve os zeros à esquerda no EAN. Valide a leitura dos códigos com o tamanho de etiqueta e a impressora que serão usados.
- **Criar Stories** gera uma arte de 1080 × 1920 por produto. Dentro do editor, escolha o canal e use as guias para manter o conteúdo fora das bordas. Um CSV com vários produtos gera um lote de PNGs. No Pro e Business, é possível baixar cada arte em JPG. A exportação usa 1 crédito por arte.
- **Criar Cardápio** gera A4, digital vertical ou horizontal para TV. O CSV aceita a coluna `descricao`. Salve o projeto e publique na seção **Cardápio digital** para obter o link e o QR Code. O link mostra a versão salva mais recente e pode ser revogado. A exportação usa 2 créditos por página, com PDF e JPG conforme o plano.
- **TV de Ofertas** permite montar playlists com ofertas de uma campanha, itens avulsos e banners enviados como imagens. Defina duração, transição e orientação, depois salve e crie um link por aparelho. Abra o link em um navegador compatível na Smart TV ou use um computador via HDMI. O player consulta alterações a cada 30 segundos e mantém a última playlist carregada durante falhas temporárias. Para encerrar o acesso de um aparelho, revogue o link correspondente.

Os custos e limites dos recursos existentes continuam definidos pelas regras de planos do Django. TV de Ofertas usa slides no navegador e não registra uma exportação de vídeo. O painel comercial e seu CSV incluem projetos e exportações de Stories e Cardápios, playlists, links de TV e o uso de Etiquetas.

Antes de publicar, revise a migração `0011_project_share` com `python manage.py migrate --plan`. No Render, o script de inicialização aplica as migrações pendentes. A migração cria a tabela de links. Na Vercel, mantenha o proxy de `/api` e o fallback para o React Router, que também atende `/cardapio/:token` e `/tv/player/:token`.
