import { GoogleGenAI } from "@google/genai";
import Tesseract from 'tesseract.js';

// 确保 API Key 存在
const apiKey = process.env.API_KEY;

// 使用 Gemini 2.5 Flash 进行高质量 OCR
// 相比 Tesseract，AI 模型对中文、手写体、复杂排版的识别率极高
export const performOCR = async (base64Image: string, engine: 'gemini' | 'tesseract' = 'gemini'): Promise<string> => {
  if (!base64Image) return "";

  // 1. 处理本地 OCR (Tesseract.js)
  // 注意：第一次运行时会自动下载中文语言包 (chi_sim.traineddata, 约 20MB)，需要网络
  if (engine === 'tesseract') {
     try {
         console.log("正在使用 Tesseract 进行本地 OCR (模式: Auto PSM)...");
         
         const imageUrl = base64Image.startsWith('data:') 
            ? base64Image 
            : `data:image/png;base64,${base64Image}`; // 本地模式使用 PNG

         // 关键修改：使用 chi_sim+eng 混合模型
         // 并配置 tessedit_pageseg_mode 为 '3' (PSM.AUTO)
         const result = await Tesseract.recognize(
            imageUrl,
            'chi_sim+eng', 
            {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        // console.debug(`OCR Progress: ${(m.progress * 100).toFixed(0)}%`);
                    }
                }
            }
         );
         
         let text = result.data.text.replace(/[\r\n]+/g, '\n');
         text = text.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2');
         
         return text.trim();
     } catch (err) {
         console.error("本地 OCR (Tesseract) 失败:", err);
         return "";
     }
  }

  // 2. 处理 Gemini OCR
  if (!apiKey) {
     console.error("API_KEY not found");
     // 这里抛出错误，让上层 UI 能够捕获并提示用户（在 Console 中）
     // Vercel 部署经常忘记配置环境变量
     throw new Error("API_KEY 未配置。请在 Vercel 设置中添加 API_KEY 环境变量。");
  }

  const ai = new GoogleGenAI({ apiKey: apiKey });
  const modelName = "gemini-2.5-flash"; 
  const retries = 3; 

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: {
          parts: [
            {
              inlineData: {
                // 关键修改：Gemini 模式现在接收的是 JPEG (体积小，适合移动端上传)
                mimeType: 'image/jpeg', 
                data: base64Image
              }
            },
            {
              text: "OCR任务：请提取这张图片中的所有可见文字。要求：1.直接输出内容，不要任何开场白或解释。2.保持原文的段落结构。3.如果包含公式或乱码，尽量转为自然语言描述或忽略。4.如果是中文文档，请确保汉字识别准确。"
            }
          ]
        }
      });

      return response.text || "";
    } catch (error: any) {
      let isRateLimit = false;
      const msg = (error.message || '') + JSON.stringify(error);
      
      if (error.status === 429 || error.status === 503 || msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
         isRateLimit = true;
      }

      if (isRateLimit) {
         if (attempt < retries - 1) {
            const delay = 2000 * Math.pow(2, attempt); 
            console.warn(`Gemini OCR 限流 (429). 将在 ${delay}ms 后重试...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue; 
         }
      }

      console.error("Gemini OCR Error:", error);
      return "";
    }
  }
  return "";
};

export const performFreeOCR = performOCR;