# Render Free com mídia privada no Cloudflare R2

## Cloudflare R2

1. Crie um bucket dedicado à mídia da Ofertech.
2. Mantenha desativados o endereço público `r2.dev` e os domínios públicos personalizados. O navegador baixa imagens pela API da Ofertech, após verificação do usuário proprietário. Não é necessário cadastrar CORS do frontend no bucket.
3. Gere credenciais **S3** de **Object Read & Write** restritas ao bucket. Copie o Access Key ID, a Secret Access Key e o endpoint S3 apresentado no painel. Para R2, use a região `auto`. [Configuração S3 do R2](https://developers.cloudflare.com/r2/get-started/s3/) · [Acesso público no R2](https://developers.cloudflare.com/r2/buckets/public-buckets/)

## Variáveis no Render

| Variável | Valor |
| --- | --- |
| `R2_BUCKET_NAME` | `ofertech-media` |
| `R2_ENDPOINT_URL` | Endpoint HTTPS da API S3 do painel, como `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. Use o endpoint regional fornecido se aplicável. |
| `R2_ACCESS_KEY_ID` | Access Key ID S3 |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key S3 |
| `R2_REGION` | `auto` |

Mantenha os valores existentes de `DATABASE_URL`, `DJANGO_SECRET_KEY`, autenticação, CORS e Mercado Pago. Os quatro valores R2 ativam o armazenamento externo automaticamente. `DJANGO_MEDIA_STORAGE` e `DJANGO_MEDIA_ROOT` são dispensáveis no Render. Um conjunto R2 incompleto impede a inicialização. O conjunto anterior `DJANGO_S3_*` continua compatível com `DJANGO_MEDIA_STORAGE=s3`. Use as credenciais do bucket apenas nas variáveis do **backend Render**.

## Sequência no Render Free

- **Root Directory** `backend`
- **Build Command** `python -m pip install -r requirements.txt && python manage.py collectstatic --noinput`
- **Start Command** `sh start-render.sh`
- **Health Check Path** `/api/health/`

O `collectstatic` monta os arquivos estáticos públicos do Django em `staticfiles/` durante o build. WhiteNoise serve apenas essa árvore. Uploads de clientes usam R2, e buffers temporários de uma requisição não fazem parte do armazenamento permanente.
O Django Admin mostra as referências das miniaturas e dos logotipos como texto. O envio e a leitura dessas imagens continuam nas rotas autenticadas.

O script valida a conectividade e a permissão de listagem no bucket, aplica migrações pendentes no PostgreSQL configurado e inicia o Gunicorn. O plano Free não oferece comando de pré-deploy nem disco persistente. Para publicar manualmente, desative o Auto-Deploy antes de enviar a revisão e, após configurar o ambiente e copiar a mídia anterior, selecione **Manual Deploy → Deploy latest commit**. [Deploys do Render](https://render.com/docs/deploys)

## Mídia e dados existentes

O Django usa as mesmas chaves relativas antes e depois da troca. Assim, mantenha o PostgreSQL atual e preserve os nomes dos objetos ao copiar a mídia. Campanhas, usuários, créditos e projetos continuam no mesmo banco. O switch de storage não copia objetos automaticamente.

1. Antes de mudar o serviço, faça backup do banco e da pasta de mídia antiga. Se a mídia antiga existia apenas em um filesystem efêmero que já foi perdido, procure a última cópia disponível.
2. Copie o **conteúdo** da raiz da mídia para a **raiz** do bucket privado, preservando caminhos como `campaigns/…` e `store-brands/…`. Faça a primeira conferência com a opção de simulação da ferramenta de cópia. Use operação de cópia que não remova objetos e trate divergências sem sobrescrever objetos do destino. Durante o corte, interrompa uploads temporariamente ou faça uma última cópia após encerrar gravações no storage antigo. [rclone copy](https://rclone.org/commands/rclone_copy/)
3. Em homologação, execute `python manage.py check_media_storage` e, se disponível no checkout implantado, `python manage.py audit_media` para conferir as referências. Depois valide pela API um upload, seu download pelo proprietário, uma tentativa de acesso por outra conta e a leitura após reinício.
4. Mantenha o backup original até validar o conteúdo. A listagem no start confirma a conexão, mas o upload real deve ser testado com uma chave que tenha leitura e escrita. Se for preciso voltar ao armazenamento anterior, copie antes os novos uploads que existem apenas no bucket.

O plano Free do serviço web e o plano do banco são escolhas separadas. Preserve a instância PostgreSQL existente e confira sua retenção. O PostgreSQL Free do Render tem prazo de expiração. [Limitações do Render Free](https://render.com/docs/free)
