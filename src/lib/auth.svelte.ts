import type { User } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { supabase } from "./supabase";

/** Fonte única da allowlist de e-mails permitidos. */
export const ALLOWED_EMAILS = ["marciordcosta@gmail.com", "teste@teste.com"];

/** Esquema customizado pro deep link de volta do login com Google no app nativo — só
 * funciona depois de cadastrado em duas configurações fora deste repositório:
 * 1) AndroidManifest.xml (intent-filter da MainActivity, já feito);
 * 2) Painel do Supabase > Authentication > URL Configuration > Redirect URLs — precisa
 *    adicionar essa URL exata lá manualmente, ninguém além do dono do projeto Supabase
 *    consegue fazer isso. */
export const OAUTH_REDIRECT_NATIVO = "com.marciocosta.fitforge://login-callback";

let user = $state<User | null>(null);
let loading = $state(true);
/** Sessão criada a partir de um link de recuperação de senha (ver "Esqueci minha senha" em
 * Login.svelte) — enquanto true, App.svelte mostra o formulário de nova senha em vez do resto do
 * app, mesmo já "logado" tecnicamente (a sessão de recovery é uma sessão de verdade). */
let emRecuperacao = $state(false);

async function init(): Promise<void> {
  // getSession() lê a sessão já persistida localmente pelo supabase-js, sem rede —
  // é o que permite o app abrir offline (cold start com o .apk sem sinal, por
  // exemplo). getUser() sempre pede rede pra revalidar contra o servidor; se
  // rodasse primeiro, um cold start sem sinal travaria pra sempre em "loading".
  //
  // Blindado com try/catch: uma sessão salva corrompida (ex: sobra de um login com
  // OAuth interrompido no meio) não pode travar `loading` pra sempre — isso deixava
  // o app inteiro preso na tela de "Carregando…", em qualquer navegador, sem
  // recuperação possível pro usuário (nem a tela de login aparecia).
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    user = sessionData.session?.user ?? null;
  } catch (e) {
    console.error("Erro ao ler sessão salva — tratando como deslogado.", e);
    user = null;
  } finally {
    loading = false;
  }

  supabase.auth.getUser().catch(() => {
    // Sem rede — a sessão local já populou `user`, não há nada a revalidar agora;
    // onAuthStateChange cobre qualquer mudança real assim que a rede voltar.
  });

  supabase.auth.onAuthStateChange((event, session) => {
    user = session?.user ?? null;
    if (event === "PASSWORD_RECOVERY") emRecuperacao = true;
  });
}

void init();

// Completa o login com Google no app nativo: o Browser.open (Login.svelte) abriu o
// OAuth numa aba do navegador in-app, e o Google redireciona de volta pra
// OAUTH_REDIRECT_NATIVO ao terminar — o Android entrega essa URL aqui via
// appUrlOpen (intent-filter da MainActivity), não como navegação normal da página.
if (Capacitor.isNativePlatform()) {
  CapApp.addListener("appUrlOpen", ({ url }) => {
    // TEMPORÁRIO — diagnóstico do login com Google (ver conversa): sem acesso a log
    // real do celular, esses alerts mostram na tela exatamente onde o fluxo trava.
    // Remover depois de confirmar que está funcionando.
    if (!url.startsWith(OAUTH_REDIRECT_NATIVO)) {
      alert("[debug] Deep link recebido, mas não é o de login:\n" + url);
      return;
    }
    void Browser.close();
    supabase.auth.exchangeCodeForSession(url).then(
      () => alert("[debug] Login com Google concluído!"),
      (e) => alert("[debug] Erro ao concluir login com Google: " + (e as Error).message),
    );
  });
}

export const auth = {
  get user(): User | null {
    return user;
  },
  get loading(): boolean {
    return loading;
  },
  get isAllowed(): boolean {
    return !!user?.email && ALLOWED_EMAILS.includes(user.email);
  },
  get emRecuperacao(): boolean {
    return emRecuperacao;
  },
  concluirRecuperacao(): void {
    emRecuperacao = false;
  },
};

export async function logout(): Promise<void> {
  await supabase.auth.signOut();
}
