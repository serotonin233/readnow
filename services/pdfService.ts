import * as pdfjsLib from 'pdfjs-dist';

// 设置 worker Src，必须指向 CDN 或本地正确的 worker 文件
// 使用 .mjs 版本以支持 ES Module 动态导入，避免 "Failed to fetch dynamically imported module" 错误
// 明确指定版本 4.10.38 以匹配 package.json，防止版本不一致
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs`;

export const extractTextFromPDF = async (file: File): Promise<{ text: string; pageCount: number }> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    let fullText = '';
    const pageCount = pdf.numPages;

    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      
      fullText += pageText + '\n\n';
    }

    return {
      text: fullText.trim(),
      pageCount: pageCount
    };
  } catch (error) {
    console.error("Error parsing PDF:", error);
    throw new Error("无法解析 PDF 文件，请确保文件未损坏且未加密。");
  }
};