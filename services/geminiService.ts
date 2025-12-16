import { GoogleGenAI, Modality } from "@google/genai";

// 确保 API Key 存在
const apiKey = process.env.API_KEY;
if (!apiKey) {
  console.error("API_KEY is missing in environment variables.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || '' });

// 文本转语音 (TTS)
export const generateSpeechFromText = async (text: string, voiceName: string = 'Kore'): Promise<string> => {
  const cleanText = text.trim();
  if (!cleanText) throw new Error("文本内容为空");

  // Gemini Flash TTS 模型
  const modelName = "gemini-2.5-flash-preview-tts";
  const retries = 3;
  let lastError: any;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{ parts: [{ text: cleanText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { 
                voiceName: voiceName 
              },
            },
          },
        },
      });

      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData?.data) {
            return part.inlineData.data;
          }
        }
        
        for (const part of response.candidates[0].content.parts) {
            if (part.text) {
                throw new Error(`模型无法朗读此段落: ${part.text}`);
            }
        }
      }

      throw new Error("未能生成音频数据 (Response empty)");

    } catch (error: any) {
      const isFatal = error.message?.includes("模型无法朗读");
      
      if (isFatal || attempt === retries - 1) {
         console.error("Gemini TTS Final Error:", error);
         lastError = error;
         break;
      }
      
      console.warn(`TTS Attempt ${attempt + 1} failed, retrying...`, error);
      // 指数退避
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }

  throw lastError || new Error("生成音频失败，请稍后重试。");
};

// 图片转文字 (OCR)
export const performOCR = async (base64Image: string): Promise<string> => {
  if (!base64Image) return "";

  // 使用 Gemini 2.5 Flash 进行 OCR
  const modelName = "gemini-2.5-flash"; 
  const retries = 5; 

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Image
              }
            },
            {
              text: "请提取这张图片中的所有文字，直接输出文字内容，不要包含任何其他解释、前言或格式标记。如果图片中没有可读文字，请返回空字符串。"
            }
          ]
        }
      });

      return response.text || "";
    } catch (error: any) {
      let isRateLimit = false;
      let isServerOverload = false;
      
      // 1. 检查标准的 HTTP 状态码
      if (error.status === 429) isRateLimit = true;
      if (error.status === 503) isServerOverload = true;

      // 2. 检查错误消息字符串
      const msg = (error.message || '') + JSON.stringify(error);
      if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
         isRateLimit = true;
      }
      if (msg.includes('503') || msg.includes('Overloaded')) {
         isServerOverload = true;
      }

      // 3. 特殊处理：尝试解析消息为 JSON (针对 {"error":{"code":429...}} 这种情况)
      if (!isRateLimit && error.message && error.message.trim().startsWith('{')) {
        try {
            const parsed = JSON.parse(error.message);
            if (parsed.error) {
                if (parsed.error.code === 429 || parsed.error.status === 'RESOURCE_EXHAUSTED') {
                    isRateLimit = true;
                }
            }
        } catch (e) {
            // 忽略 JSON 解析错误
        }
      }

      if (isRateLimit || isServerOverload) {
         if (attempt < retries - 1) {
            // 指数退避: 2s, 4s, 8s, 16s...
            const delay = 2000 * Math.pow(2, attempt); 
            console.warn(`Gemini OCR Rate Limit Hit (429/503). Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue; // 明确继续下一次循环
         }
      }

      console.error("Gemini OCR Error:", error);
      
      // 如果不是 Rate Limit 或重试耗尽，则放弃该图片，返回空字符串以免阻塞整个流程
      if (attempt === retries - 1) {
          return "";
      }
    }
  }
  return "";
}