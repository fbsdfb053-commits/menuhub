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
O repositório tem um workflow em `.github/workflows/mobile-apk.yml`. Ele compila em runner Linux padrão do GitHub Actions, gratuito para este repositório público. A configuração usa apenas a URL e a chave publishable do Supabase (chave pública própria para apps; nunca usar `service_role`). Não precisa criar conta Expo, informar cartão ou contratar serviço.

Cada atualização em `mobile/` na branch `app-android` dispara a compilação. O APK de depuração fica disponível em Artifacts por 7 dias. O workflow não publica nada no site.

A chave publishable/anon pode estar no cliente; nunca adicionar service_role ou secret key.
