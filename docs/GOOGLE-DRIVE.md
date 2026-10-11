# Google Drive nas tarefas

## O que já funciona (sem configurar nada)
- **Anexar arquivos** do computador (até 25 MB cada), guardados em bucket privado do Supabase; download por link assinado de 60 s.
- **Anexar link** de qualquer lugar: Google Drive, Docs, Sheets, Slides, Figma, Canva… O sistema reconhece links do Google e marca como "Google Drive".
- O link abre para quem tem permissão no arquivo: **compartilhe o arquivo/pasta no Drive** com quem precisa.

## Seletor oficial do Google Drive (opcional)
Mostra o botão **Escolher no Google Drive**; o arquivo escolhido vira um *link* anexado (nada é copiado). Escopo mínimo: `drive.file` (o app só enxerga o que a pessoa escolhe). **Não foi testado nesta entrega** (precisa de credenciais Google): teste em homologação.

1. Acesse console.cloud.google.com e crie um projeto (ex.: `guria-os`).
2. **APIs e serviços → Biblioteca**: ative **Google Picker API** e **Google Drive API**.
3. **Tela de permissão OAuth**: tipo *Externo*, nome do app, e-mail de suporte; adicione o escopo `.../auth/drive.file`. Em teste, adicione seus e-mails como *usuários de teste*; para liberar a todos, **publique o app** (o escopo `drive.file` normalmente não exige verificação completa).
4. **Credenciais → Criar credenciais → ID do cliente OAuth** (aplicativo da Web). Em *Origens JavaScript autorizadas* coloque a URL do app (e `http://localhost:3000` para testes).
5. **Credenciais → Chave de API**: restrinja a *Referenciadores HTTP* (URL do app) e às APIs *Picker* e *Drive*.
6. Na Vercel, cadastre (Production e Preview, **sem** Sensitive):
   - `NEXT_PUBLIC_GOOGLE_CLIENT_ID` = ID do cliente OAuth
   - `NEXT_PUBLIC_GOOGLE_API_KEY` = chave de API
7. Faça um novo deploy.

## Limites e próximos passos
- Não há sincronização automática de pastas nem upload *para* o Drive; o vínculo é por link.
- Para pastas por cliente com criação automática (Drive API server-side), seria necessária uma conta de serviço ou OAuth por estúdio: fica como evolução.
