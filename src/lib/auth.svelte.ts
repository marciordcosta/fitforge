import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/** Fonte única da allowlist de e-mails permitidos. */
export const ALLOWED_EMAILS = ["marciordcosta@gmail.com", "teste@teste.com"];

let user = $state<User | null>(null);
let loading = $state(true);

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

  supabase.auth.onAuthStateChange((_event, session) => {
    user = session?.user ?? null;
  });
}

void init();

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
};

export async function logout(): Promise<void> {
  await supabase.auth.signOut();
}
