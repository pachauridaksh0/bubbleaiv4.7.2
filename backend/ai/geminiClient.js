const { GoogleGenAI } = require("@google/genai");

class GeminiClient {
  
  _getClient(apiKey) {
    if (!apiKey) throw new Error("API Key is required");
    return new GoogleGenAI({ apiKey });
  }

  async validateKey(apiKey) {
    if (!apiKey) return { success: false, message: "API key cannot be empty." };
    try {
      const ai = this._getClient(apiKey);
      await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: "test",
      });
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  async generateContent(apiKey, params) {
    const ai = this._getClient(apiKey);
    const { model, contents, config } = params;
    const response = await ai.models.generateContent({
        model,
        contents,
        config
    });
    // Serialize response to send back to client
    return {
        text: response.text,
        candidates: response.candidates,
        usageMetadata: response.usageMetadata
    };
  }

  async generateImages(apiKey, params) {
      const ai = this._getClient(apiKey);
      const { model, prompt, config } = params;
      
      // Handle Image Models
      if (model.includes('imagen')) {
          const response = await ai.models.generateImages({
              model,
              prompt,
              config
          });
          return response;
      } else {
          // Nano Banana logic
          const response = await ai.models.generateContent({
              model,
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              config: { responseModalities: ['IMAGE'] }
          });
          return {
              candidates: response.candidates
          };
      }
  }

  async streamContent(apiKey, params, res) {
    const ai = this._getClient(apiKey);
    const { model, contents, config } = params;

    const result = await ai.models.generateContentStream({
        model,
        contents,
        config
    });

    for await (const chunk of result) {
        // Send chunk as SSE
        res.write(`data: ${JSON.stringify({ text: chunk.text, candidates: chunk.candidates })}\n\n`);
    }
  }
}

module.exports = new GeminiClient();