import { ArrowLeft } from 'lucide-react'

const email = 'fbsdfb053@gmail.com'

export default function PrivacyPolicy() {
  return (
    <main style={{maxWidth: 860, margin: '0 auto', padding: '32px 20px 64px', color: '#243126', lineHeight: 1.7}}>
      <a href="/" style={{display:'inline-flex',alignItems:'center',gap:8,color:'inherit',textDecoration:'none',marginBottom:28}}><ArrowLeft size={17}/> Voltar ao início</a>
      <header style={{marginBottom:32}}>
        <p style={{textTransform:'uppercase',letterSpacing:2,fontSize:12,fontWeight:700}}>FB3d2y Menu</p>
        <h1 style={{fontSize:'clamp(30px,5vw,44px)',lineHeight:1.1,margin:'12px 0'}}>Política de Privacidade</h1>
        <p>Última atualização: 26 de outubro de 2026</p>
      </header>
      <p>Esta Política explica como o FB3d2y Menu (“MenuHub”) trata dados pessoais quando restaurantes usam a plataforma e quando clientes consultam cardápios ou fazem pedidos. O serviço é operado no Brasil.</p>
      <h2>1. Dados que podem ser tratados</h2>
      <ul>
        <li><b>Conta do restaurante:</b> dados básicos da conta Google usados para autenticação, como nome e e-mail, além dos dados de cadastro do estabelecimento.</li>
        <li><b>Cardápio e operação:</b> nome do estabelecimento, produtos, preços, fotos, horários, informações de contato e configurações cadastradas pelo responsável.</li>
        <li><b>Pedidos:</b> nome do cliente, WhatsApp, endereço de entrega quando informado, itens, observações, forma de pagamento escolhida e informações necessárias para processar o pedido.</li>
        <li><b>Dados técnicos:</b> informações técnicas e registros necessários à segurança, ao diagnóstico de falhas e ao funcionamento do serviço, conforme disponíveis nos provedores utilizados.</li>
      </ul>
      <h2>2. Para que usamos os dados</h2>
      <p>Os dados são utilizados para autenticar usuários, disponibilizar e administrar cardápios, encaminhar pedidos ao restaurante escolhido, prestar suporte, proteger contas e sistemas, manter registros operacionais e cumprir obrigações legais aplicáveis.</p>
      <h2>3. Compartilhamento e fornecedores</h2>
      <p>Os dados necessários ao funcionamento podem ser processados por fornecedores de infraestrutura e autenticação, incluindo Supabase, Vercel e Google. Quando um cliente faz um pedido, as informações fornecidas são disponibilizadas ao restaurante escolhido para que ele possa atender ao pedido e combinar a entrega e o pagamento. Não vendemos dados pessoais.</p>
      <h2>4. Responsabilidades do restaurante</h2>
      <p>O restaurante é responsável pelos dados que coleta diretamente e pelo uso que faz das informações dos clientes para preparar e entregar pedidos, entrar em contato e cumprir suas obrigações. Deve acessar apenas os dados necessários, manter suas credenciais protegidas e tratar as informações de clientes de forma lícita.</p>
      <h2>5. Armazenamento e segurança</h2>
      <p>Adotamos medidas técnicas e administrativas razoáveis para proteger as informações. Nenhum sistema pode garantir segurança absoluta. Os dados são mantidos pelo período necessário à operação, ao atendimento de solicitações e ao cumprimento de obrigações legais, podendo haver retenção em cópias de segurança por período limitado.</p>
      <h2>6. Direitos dos titulares</h2>
      <p>Nos termos da legislação aplicável, incluindo a LGPD, você pode solicitar confirmação de tratamento, acesso, correção, informações sobre uso e compartilhamento e, quando aplicável, anonimização, bloqueio, eliminação ou outros direitos previstos em lei. Algumas informações podem precisar ser mantidas para cumprir obrigações legais ou resguardar direitos.</p>
      <h2>7. Cookies e armazenamento no navegador</h2>
      <p>O site pode utilizar armazenamento local do navegador para lembrar dados preenchidos anteriormente e facilitar novos pedidos. Você pode apagar esses dados nas configurações do navegador; isso pode remover preferências salvas.</p>
      <h2>8. Crianças e adolescentes</h2>
      <p>A plataforma é voltada à operação de estabelecimentos e pedidos de consumo. Responsáveis por restaurantes não devem inserir dados desnecessários de crianças ou adolescentes nos campos de pedidos.</p>
      <h2>9. Alterações desta política</h2>
      <p>Esta política poderá ser atualizada para refletir mudanças no serviço ou na legislação. A versão vigente ficará disponível nesta página, com a data de atualização.</p>
      <h2>10. Contato sobre privacidade</h2>
      <p>Para dúvidas ou solicitações relacionadas a dados pessoais, entre em contato pelo e-mail <a href={'mailto:'+email}>{email}</a>. Descreva sua solicitação e evite enviar senhas ou dados pessoais desnecessários.</p>
      <hr style={{margin:'36px 0',border:0,borderTop:'1px solid #d9dfd9'}}/>
      <p style={{fontSize:13,color:'#657067'}}>Este documento é uma base inicial de transparência e deve ser revisado conforme os processos reais do serviço e, se necessário, por profissional jurídico.</p>
      <a href="/" style={{display:'inline-flex',alignItems:'center',gap:8,color:'inherit'}}> <ArrowLeft size={16}/> Voltar ao FB3d2y Menu</a>
    </main>
  )
}
