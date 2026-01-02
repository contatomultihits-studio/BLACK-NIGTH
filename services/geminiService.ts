
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "../constants";

export const getConciergeResponse = async (userMessage: string, history: { role: 'user' | 'model', parts: { text: string }[] }[]) => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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

    return response.text || "Desculpe, tive um problema ao processar sua solicitação. Como posso ajudar?";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "No momento estou offline, mas você pode seguir com sua reserva normalmente.";
  }
};
