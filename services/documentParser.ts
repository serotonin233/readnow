import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { performOCR } from './ocrService';

// 配置 PDF.js Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs`;

export const extractTextFromDocument = async (
  file: File, 
  onProgress?: (newChunk: string) => void,
  maxChars: number = 0,
  ocrEngine: 'gemini' | 'tesseract' = 'gemini'
): Promise<string> => {
  const fileType = file.name.split('.').pop()?.toLowerCase();

  if (fileType === 'pdf') {
    return await parsePDF(file, onProgress, maxChars, ocrEngine);
  } else if (fileType === 'docx') {
    return await parseDocx(file, maxChars, ocrEngine);
  } else {
    throw new Error("不支持的文件格式，请上传 PDF 或 Word (.docx) 文件。");
  }
};

// 文本清洗函数
const cleanTextContent = (text: string): string => {
  let cleaned = text;
  cleaned = cleaned.replace(/CS\s*扫描全能王/gi, '');
  cleaned = cleaned.replace(/3亿人都在用的扫描App/g, '');
  cleaned = cleaned.replace(/全能扫描王/g, '');
  cleaned = cleaned.replace(/(关注|搜索|扫码).{0,10}(微信|公众号|微博)/g, '');
  cleaned = cleaned.replace(/二维码/g, '');
  
  cleaned = cleaned.split('\n').filter(line => {
    const trimLine = line.trim();
    if (!trimLine) return true; 
    const isAnswerKey = /^[A-Ha-h\s]+$/.test(trimLine);
    if (isAnswerKey && trimLine.length < 10) return false;
    if (/^[/\-—|@\s]+$/.test(trimLine)) return false;
    return true;
  }).join('\n');

  let prevCleaned = '';
  while (cleaned !== prevCleaned) {
      prevCleaned = cleaned;
      cleaned = cleaned.replace(/^[\s/\\|—\-，,.~～]+/g, '');
      cleaned = cleaned.replace(/[\s/\\|—\-，,.~～]+$/g, '');
  }

  return cleaned;
};

const parsePDF = async (file: File, onProgress?: (newChunk: string) => void, maxChars: number = 0, ocrEngine: 'gemini' | 'tesseract' = 'gemini'): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    let fullText = '';
    const pageCount = pdf.numPages;

    for (let i = 1; i <= pageCount; i++) {
      if (maxChars > 0 && fullText.length >= maxChars) {
        console.log(`已达到设定的阅读时长限制 (${maxChars}字)，停止解析后续页面。`);
        break;
      }

      const page = await pdf.getPage(i);
      
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ')
        .trim();
      
      let rawTextPart = '';

      // 如果页面文字极少，判定为图片扫描件
      if (pageText.length < 50) {
        // 关键修改：传入 ocrEngine 参数，决定渲染策略
        const imageBase64 = await renderPageToImage(page, ocrEngine);
        if (imageBase64) {
           const ocrText = await performOCR(imageBase64, ocrEngine);
           rawTextPart = ocrText;
        }
      } else {
        rawTextPart = pageText;
      }

      const cleanedPart = cleanTextContent(rawTextPart);

      if (cleanedPart.trim().length > 0) {
        const formattedPart = cleanedPart + '\n\n';
        fullText += formattedPart;

        if (onProgress) {
          onProgress(formattedPart);
        }
      }
    }

    return fullText.trim();
  } catch (error) {
    console.error("Error parsing PDF:", error);
    throw new Error("无法解析 PDF 文件，请确保文件未损坏且未加密。");
  }
};

// 图像预处理：灰度化 + 对比度增强 (仅用于本地 OCR)
const preprocessCanvas = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // 对比度调整因子
    const contrast = 30; 
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // 1. 转为灰度
        let gray = 0.299 * r + 0.587 * g + 0.114 * b;

        // 2. 应用对比度增强
        gray = factor * (gray - 128) + 128;

        if (gray < 0) gray = 0;
        if (gray > 255) gray = 255;
        
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
    }
    
    ctx.putImageData(imageData, 0, 0);
};

const renderPageToImage = async (page: any, ocrEngine: 'gemini' | 'tesseract'): Promise<string | null> => {
  try {
    // === 策略分流 ===
    // 1. Tesseract (本地): 需要极高的清晰度和预处理 (Scale 3.5, PNG)
    // 2. Gemini (云端): 需要较小的体积以便快速上传，且模型自带强大的视觉理解，不需要二值化 (Scale 2.0, JPEG)
    
    const isLocal = ocrEngine === 'tesseract';
    const scale = isLocal ? 3.5 : 2.0; 

    const viewport = page.getViewport({ scale: scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    
    if (!context) return null;

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: context, viewport: viewport }).promise;
    
    // 仅针对 Tesseract 进行预处理
    // Gemini 最好看原图（带颜色和阴影），预处理反而可能丢失信息
    if (isLocal) {
        preprocessCanvas(canvas, context);
        // 本地使用 PNG 无损
        const dataUrl = canvas.toDataURL('image/png');
        return dataUrl.split(',')[1];
    } else {
        // Gemini 使用 JPEG 压缩，质量 0.8
        // 这可以将体积从 10MB 降低到 500KB - 1MB，极大加速手机端上传
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        return dataUrl.split(',')[1];
    }

  } catch (e) {
    console.error("Failed to render page for OCR", e);
    return null;
  }
};

const parseDocx = async (file: File, maxChars: number = 0, ocrEngine: 'gemini' | 'tesseract' = 'gemini'): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    const result = await mammoth.extractRawText({ arrayBuffer });
    let text = cleanTextContent(result.value.trim());
    
    if (text.length > 50) {
        if (maxChars > 0 && text.length > maxChars) {
            text = text.substring(0, maxChars);
        }
        return text;
    }

    const images: string[] = [];
    const options = {
        convertImage: mammoth.images.imgElement((image: any) => {
            return image.read("base64").then((imageBuffer: string) => {
                images.push(imageBuffer);
                return { src: "" }; 
            });
        })
    };
    
    await mammoth.convertToHtml({ arrayBuffer }, options);

    if (images.length === 0) {
        return text;
    }

    const imagesToProcess = images.slice(0, 50); 
    let ocrResults = "";
    
    for (const base64 of imagesToProcess) {
        if (maxChars > 0 && (text.length + ocrResults.length) >= maxChars) break;
        const ocrText = await performOCR(base64, ocrEngine);
        if (ocrText) {
            ocrResults += ocrText + "\n\n";
        }
    }
    
    let finalText = (text + "\n\n" + ocrResults).trim();
    finalText = cleanTextContent(finalText);

    if (maxChars > 0 && finalText.length > maxChars) {
        finalText = finalText.substring(0, maxChars);
    }

    return finalText;

  } catch (error) {
    console.error("Error parsing DOCX:", error);
    throw new Error("无法解析 Word 文件，请确保文件是标准的 .docx 格式。");
  }
};