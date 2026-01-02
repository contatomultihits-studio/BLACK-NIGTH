
import { createClient } from '@supabase/supabase-js';

// Função para pegar variáveis de ambiente de forma segura no browser
const getEnv = (key: string): string => {
  try {
    return (process.env as any)[key] || '';
  } catch {
    return '';
  }
};

const supabaseUrl = getEnv('SUPABASE_URL');
const supabaseAnonKey = getEnv('SUPABASE_ANON_KEY');

export const isSupabaseConfigured = supabaseUrl.length > 0 && supabaseAnonKey.length > 0;

// Só cria o cliente se houver configuração, evitando erros fatais
export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;
