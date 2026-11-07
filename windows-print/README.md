# Fb3d2y Print para Windows

Aplicativo auxiliar local para impressão ESC/POS de pedidos do Fb3d2y Menu.

## Requisitos
- Windows 10 ou 11 (64 bits)
- Impressora térmica instalada e funcionando no Windows
- Driver da impressora instalado

## Como funciona
O aplicativo fica na bandeja do Windows e abre um serviço HTTP somente em `127.0.0.1:17832`. O site consulta `GET /health` e envia comandas para `POST /print` com cabeçalho `Authorization: Bearer <código>`.

O serviço aceita apenas chamadas originadas de `https://fb3d2ymenu.com.br` e `https://www.fb3d2ymenu.com.br`. O código é criado localmente e fica em `%AppData%\Fb3d2yPrint\connection.key`.

## Segurança
- O servidor escuta somente no loopback (não fica exposto à rede).
- Toda impressão exige o token local.
- CORS limitado ao domínio de produção.
- Não recebe nem armazena pedidos; apenas imprime o conteúdo enviado pelo painel autenticado.

## Compilar
```powershell
dotnet publish .\Fb3d2yPrint.csproj -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true
```
