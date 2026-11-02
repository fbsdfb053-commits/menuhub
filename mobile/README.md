# Fb3d2y Menu — Android

Aplicativo nativo em React Native/Expo. Não usa WebView e não abre o painel web.

## Custo
Desenvolvimento local com Expo é gratuito. Builds EAS podem usar a cota gratuita; nunca selecionar plano pago ou consumo adicional.

## Configuração local
1. Instale Node.js LTS e npm.
2. Entre na pasta `mobile`.
3. Copie `.env.example` para `.env` e informe a URL e a chave publishable do Supabase.
4. Execute `npm install`.
5. Execute `npx expo start` e abra pelo Expo Go para validar a interface.
6. Para APK independente, configurar EAS com perfil Android APK e conferir a cota gratuita antes de iniciar build.

A chave publishable/anon pode estar no cliente; nunca adicionar service_role ou secret key.
