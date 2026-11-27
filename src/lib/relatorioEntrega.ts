import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { supabase } from "./supabase";
import { auth } from "./auth.svelte";

/** Entrega o PDF no aparelho.
 * - App Android (Capacitor, WebView): o WebView não baixa arquivo de blob nem tem o menu de
 *   compartilhar, então o PDF sobe pro armazenamento do usuário (mesmo bucket das fotos, pasta
 *   `relatorios/`, sempre o mesmo arquivo sobrescrito) e abre por um link assinado de 5 minutos no
 *   navegador do sistema (Chrome Custom Tab), que baixa/abre o PDF.
 * - Navegador/PWA: compartilhar (se houver) ou baixar direto. */
export async function entregarPdf(blob: Blob, nome: string): Promise<"aberto" | "compartilhado" | "baixado"> {
  if (Capacitor.isNativePlatform()) {
    const userId = auth.user?.id;
    if (!userId) throw new Error("Usuário não autenticado.");
    const path = `${userId}/relatorios/relatorio-treino.pdf`;
    const { error: erroUpload } = await supabase.storage.from("fotos").upload(path, blob, { upsert: true, contentType: "application/pdf" });
    if (erroUpload) throw new Error(`Não consegui enviar o PDF: ${erroUpload.message}`);
    const { data, error } = await supabase.storage.from("fotos").createSignedUrl(path, 300, { download: nome });
    if (error || !data) throw new Error(`Não consegui abrir o PDF: ${error?.message ?? "link indisponível"}`);
    await Browser.open({ url: data.signedUrl });
    return "aberto";
  }

  const arquivo = new File([blob], nome, { type: "application/pdf" });
  try {
    if (navigator.canShare?.({ files: [arquivo] })) {
      await navigator.share({ files: [arquivo], title: nome });
      return "compartilhado";
    }
  } catch (err) {
    if ((err as DOMException)?.name === "AbortError") return "compartilhado";
  }
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return "baixado";
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
