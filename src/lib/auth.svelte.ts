import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/** Fonte única da allowlist de e-mails permitidos. */
export const ALLOWED_EMAILS = ["marciordcosta@gmail.com", "teste@teste.com"];

let user = $state<User | null>(null);
let loading = $state(true);

async function init(): Promise<void> {
  const { data } = await supabase.auth.getUser();
  user = data?.user ?? null;
  loading = false;

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
