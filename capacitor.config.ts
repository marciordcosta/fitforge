import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.marciocosta.fitforge',
  appName: 'fitforge',
  webDir: 'dist',
  // Carrega o app direto do site publicado (Vercel) em vez da cópia empacotada no
  // apk — toda correção publicada (git push) aparece sozinha no app instalado, sem
  // precisar gerar e reinstalar um novo .apk a cada mudança de código. O app
  // continua funcionando offline (o service worker do PWA guarda a última versão
  // carregada), só a primeira abertura de todas precisa de internet.
  server: {
    url: 'https://fitforgehub.vercel.app',
    cleartext: false,
  },
};

export default config;
