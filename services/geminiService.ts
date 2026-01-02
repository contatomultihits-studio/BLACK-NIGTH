
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "../constants";

export const getConciergeResponse = async (userMessage: string, history: { role: 'user' | 'model', parts: { text: string }[] }[]) => {
  try {
    // Acesso seguro ao process.env para evitar crash no navegador
    const env = typeof process !== 'undefined' ? process.env : ({} as any);
    const apiKey = env.API_KEY;

    if (!apiKey) {
      console.warn("Aviso: API_KEY não definida nas variáveis de ambiente.");
      return "ESTOU EM MANUTENÇÃO NO MOMENTO. COMO POSSO AJUDAR COM OUTRA QUESTÃO?";
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        ...history,
        { role: 'user', parts: [{ text: userMessage }] }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
        maxOutputTokens: 200,
      }
    });

    return response.text || "DESCULPE, TIVE UM PROBLEMA AO PROCESSAR SUA SOLICITAÇÃO.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "NO MOMENTO ESTOU OFFLINE, MAS VOCÊ PODE SEGUIR COM SUA RESERVA NORMALMENTE.";
  }
};
