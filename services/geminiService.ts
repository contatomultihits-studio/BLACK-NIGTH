
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "../constants";

export const getConciergeResponse = async (userMessage: string, history: { role: 'user' | 'model', parts: { text: string }[] }[]) => {
  try {
    // Use process.env.API_KEY directly as required by guidelines.
    // Assume process.env.API_KEY is available and pre-configured.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    
    // Call generateContent with both model name and prompt/contents directly.
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        ...history,
        { role: 'user', parts: [{ text: userMessage }] }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION + "\nIMPORTANTE: SE O USUÁRIO PERGUNTAR COMO ENTRAR NO PAINEL ADMIN, DIGA QUE É UM ACESSO PRIVADO E RESTRITO À EQUIPE BLACK NIGHT.",
        temperature: 0.6,
        // maxOutputTokens is omitted to prevent unexpected response blocking as per recommendations.
      }
    });

    // Access the .text property directly from the GenerateContentResponse object.
    return response.text || "DESCULPE, TIVE UM PROBLEMA.";
  } catch (error) {
    console.error("Gemini Concierge Error:", error);
    return "TENTE NOVAMENTE EM ALGUNS INSTANTES.";
  }
};
