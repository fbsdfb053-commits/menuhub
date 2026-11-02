# Fb3d2y Menu — Android

Aplicativo nativo em React Native/Expo. Não usa WebView e não abre o painel web.

## Custo
Desenvolvimento local com Expo é gratuito. Builds EAS podem usar a cota gratuita; nunca selecionar plano pago ou consumo adicional.

## Configuração local
1. Instale Node.js 22.13 ou superior e npm.
2. Entre na pasta `mobile`.
3. Copie `.env.example` para `.env` e informe a URL e a chave publishable do Supabase.
4. Execute `npm install`.
5. Execute `npx expo start` para abrir a interface no ambiente de desenvolvimento.

## Gerar APK sem contratar serviços
O repositório tem um workflow manual do GitHub Actions em `.github/workflows/mobile-apk.yml`. Como o repositório é público, ele usa runner Linux padrão sem custo. Antes de executar, cadastre em **Settings → Secrets and variables → Actions → Variables** estas duas variáveis de repositório:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Depois abra **Actions → Build Fb3d2y Menu APK → Run workflow**. O APK de depuração ficará em Artifacts por 7 dias. O workflow só roda quando acionado manualmente e não publica nada no site.

A chave publishable/anon pode estar no cliente; nunca adicionar service_role ou secret key.
