// 将长文本智能切分为适合 TTS 的片段
// 修改：默认长度增加到 1500，以减少浏览器语音合成时的段落间停顿
export function splitTextIntoChunks(text: string, maxChars: number = 1500): string[] {
  if (!text) return [];

  // 按常见结束标点分割，保留标点
  // 匹配：句号、问号、感叹号、换行符
  const sentences = text.split(/([。.！!？?\n\r]+)/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    
    // 如果当前块加上新句子超过最大长度，且当前块不为空，则保存当前块
    if (currentChunk.length + s.length > maxChars && currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }
    currentChunk += s;
  }
  
  // 添加最后剩余的部分
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// 根据给定的索引，找出包含该索引的单词或字符范围
export function getWordAt(text: string, index: number): { start: number; end: number } {
  if (index < 0 || index >= text.length) return { start: 0, end: 0 };

  const isSeparator = (char: string) => /[\s,.!?;:()\[\]{}""''`~@#$%^&*\-_=+\\|<>\/，。！？；：“”‘’（）【】]/.test(char);

  let start = index;
  let end = index;

  // 如果当前点是分隔符，只高亮这个分隔符
  if (isSeparator(text[index])) {
      return { start: index, end: index + 1 };
  }

  // 向前找词头
  while (start > 0 && !isSeparator(text[start - 1])) {
    start--;
  }

  // 向后找词尾
  while (end < text.length && !isSeparator(text[end])) {
    end++;
  }

  return { start, end };
}