import { Link } from 'react-router-dom'
import { BrandFooter, BrandLink, commercialLinks } from '../components/Brand'

type InfoPage = typeof commercialLinks[number][0]

const content: Record<InfoPage, [string, string][]> = {
  termos: [
    ['Quem fornece o serviço', 'Razão social [pendente]. CNPJ [pendente]. Endereço [pendente]. Canal de atendimento [pendente].'],
    ['Conta e conteúdo', 'A Ofertech oferece ferramentas para criar, salvar e exportar peças promocionais. Use imagens e marcas para as quais você tem autorização e confira preços, condições da oferta e arquivos antes de publicar.'],
    ['Planos e recorrência', 'A página de planos informa o preço mensal, os formatos incluídos e o custo de cada operação. Em uma assinatura recorrente, os créditos do ciclo pago são liberados após confirmação do pagamento pelo provedor.'],
    ['Links compartilhados', 'Quem tiver um link ativo de cardápio ou TV poderá ver o conteúdo publicado. Revogue o link no painel quando quiser retirar o acesso.'],
  ],
  privacidade: [
    ['Controlador e contato', 'Controlador [razão social e CNPJ pendentes]. Canal para exercício de direitos [pendente].'],
    ['Dados e finalidade', 'A conta usa nome e e-mail para autenticação e atendimento. Projetos, fotos e configurações são tratados para prestar o serviço. Registros técnicos e de cobrança apoiam a segurança, o controle de créditos e a conciliação.'],
    ['Processamento externo', 'A infraestrutura envolve Vercel e Render. O Mercado Pago processa o checkout quando a modalidade está disponível. Relação final de operadores, regiões, bases legais e prazos de retenção [pendente de validação].'],
    ['Direitos e retenção', 'Você pode solicitar confirmação, acesso, correção e demais direitos previstos na LGPD. A exclusão é avaliada de acordo com os dados envolvidos e as hipóteses legais de conservação. Política de retenção e backups [pendente].'],
  ],
  cancelamentos: [
    ['Cancelar renovação', 'Em Planos e créditos, use Cancelar assinatura e confira o estado exibido. Quando o provedor confirmar o cancelamento, o acesso a um ciclo já pago segue até a data indicada no painel.'],
    ['Pedir análise de reembolso', 'Envie o e-mail da conta, a data e o identificador do pagamento ao canal oficial [pendente]. Nunca envie senha ou dados completos do cartão. A Ofertech deve confirmar o recebimento e informar o resultado da análise.'],
    ['Direito de arrependimento', 'Em relações de consumo, a contratação fora do estabelecimento está sujeita ao direito de arrependimento previsto no art. 49 do CDC. A versão final deve informar o canal e o procedimento para exercer esse direito.'],
  ],
  ajuda: [
    ['Primeiro acesso', 'Escolha um exemplo em Modelos, abra o editor e troque os produtos, preços e imagens. Confira a prévia. Ao salvar ou exportar, entre ou crie sua conta e confirme a operação.'],
    ['Créditos e exportações', 'Consulte o custo por arte, folha ou página em Planos e créditos. O formato disponível depende do plano. Na exportação de vídeo, a compatibilidade também depende do navegador.'],
    ['Assinatura e pagamento', 'Consulte a situação em Planos e créditos. Se o pagamento estiver pendente ou recusado, confira os dados no provedor. A volta do checkout por si só não libera créditos.'],
    ['Atendimento', 'E-mail, horários e prazo de resposta [pendentes]. Para relatar um erro, informe qual editor usou, o horário aproximado e o que apareceu na tela.'],
  ],
  'excluir-conta': [
    ['Como solicitar', 'Use o canal de privacidade [pendente] e informe o e-mail da conta e se deseja excluir a conta inteira ou dados específicos. A equipe confirmará sua identidade pelo canal oficial antes de processar o pedido.'],
    ['Antes de enviar', 'Exporte as artes que deseja guardar e verifique a situação de assinaturas e links publicados. A exclusão de projetos e fotos pode ser irreversível.'],
    ['Tratamento do pedido', 'A solicitação será analisada por uma pessoa responsável. Dados sujeitos a obrigação de conservação podem precisar ser mantidos pelo prazo aplicável.'],
  ],
}

export function CommercialInfo({ page }: { page: InfoPage }) {
  const title = commercialLinks.find(([path]) => path === page)?.[1]
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <main className="mx-auto max-w-3xl space-y-7 px-6 py-10">
        <BrandLink />
        <header>
          <h1 className="text-3xl font-black">{title}</h1>
          <p className="mt-2 text-sm text-slate-600">Versão preliminar para revisão antes do lançamento.</p>
        </header>
        {content[page].map(([heading, text]) => (
          <section key={heading} className="space-y-2">
            <h2 className="text-xl font-bold">{heading}</h2>
            <p className="leading-7 text-slate-700">{text}</p>
          </section>
        ))}
        <Link to="/plans" className="inline-block font-semibold text-indigo-700 underline">Consultar planos e créditos</Link>
      </main>
      <BrandFooter className="mx-auto max-w-3xl border-t border-slate-200 px-6 py-6 text-slate-600" />
    </div>
  )
}
