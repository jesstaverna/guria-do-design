# Guria Automação

Central de automação própria (uso interno): **comentário no Instagram → resposta pública + DM com conteúdo gratuito**.
Fase 2 prevista: WhatsApp.

## Como funciona
1. Alguém comenta uma palavra-chave (ex.: "quero") num post.
2. O servidor recebe o webhook da Meta, responde o comentário e envia uma DM (Private Reply) com um botão.
3. Quando a pessoa clica no botão, abre a janela de 24h e o conteúdo é enviado.
4. Leads e entregas ficam em SQLite (sem duplicar envios).

## Regras
Edite `config/rules.json`: palavras-chave, respostas públicas (uma é sorteada), texto da DM, botão e conteúdo final.
`posts` vazio = vale para qualquer post; coloque IDs de mídia para restringir.

## Rodar
```bash
cp .env.example .env   # preencha
npm install
npm test
DRY_RUN=true npm start # não envia nada para a Meta, só loga
npm start
```
Precisa de URL pública com HTTPS (Railway, Render, Fly.io ou ngrok para testes).

## Configurar o app na Meta
1. Conta do Instagram Profissional, ligada a uma Página do Facebook.
2. developers.facebook.com → criar app → produto **Instagram** (API com login do Instagram).
3. Permissões: `instagram_business_basic`, `instagram_business_manage_comments`, `instagram_business_manage_messages`.
4. Webhooks: callback `https://SEU-DOMINIO/webhook`, token = `VERIFY_TOKEN`; assinar `comments` e `messages` (incluindo postbacks).
5. Gerar o token da sua conta e preencher `IG_ACCESS_TOKEN`, `IG_USER_ID` e `APP_SECRET`.
6. Em modo desenvolvimento só funciona com contas adicionadas como testers; para outras contas é preciso revisão do app.

## Limites da Meta
- Private Reply: 1 por comentário, em até 7 dias.
- DM livre: só dentro de 24h após a interação da pessoa.
- Tokens de longa duração expiram (~60 dias): renove.

## A verificar na primeira execução real
O formato exato do botão no Private Reply e dos payloads de postback deve ser conferido com a sua conta (veja os logs em `DRY_RUN=false`).
