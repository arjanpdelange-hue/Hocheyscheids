import { GoogleGenAI } from "@google/genai";
import { HOCKEY_RULES_CONTEXT } from "../constants";

const getAiClient = () => {
  // In a real scenario, ensure this key is process.env.API_KEY
  // For this demo, we assume the environment variable is set in the build/runtime
  if (!process.env.API_KEY) {
    console.warn("API_KEY is missing.");
    return null;
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const askHockeyAssistant = async (userQuestion: string): Promise<string> => {
  const ai = getAiClient();
  if (!ai) return "API Key ontbreekt. Configureer de API key om de assistent te gebruiken.";

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userQuestion,
      config: {
        systemInstruction: HOCKEY_RULES_CONTEXT,
        temperature: 0.3, // Low temperature for factual rule-based answers
        maxOutputTokens: 300, // Keep answers concise
      },
    });

    return response.text || "Ik kon geen antwoord genereren op basis van de regels.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Er is een fout opgetreden bij het verbinden met de KNHB assistent.";
  }
};