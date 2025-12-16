
// 将 Base64 字符串解码为 Uint8Array
export function decodeBase64(base64: string): Uint8Array {
  // 移除可能存在的换行符和空格
  const cleanBase64 = base64.replace(/[\r\n\s]/g, '');
  const binaryString = atob(cleanBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// 将原始 PCM 数据解码为 AudioBuffer
export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  // 【关键修复】确保字节长度是 2 的倍数 (16-bit PCM 需要偶数字节)
  // 如果 API 返回了奇数字节（例如 1001 字节），直接 new Int16Array 会抛出 RangeError
  let safeData = data;
  if (data.byteLength % 2 !== 0) {
      console.warn(`[AudioUtils] Received odd byte length (${data.byteLength}), trimming last byte.`);
      safeData = data.subarray(0, data.byteLength - 1);
  }

  const dataInt16 = new Int16Array(safeData.buffer, safeData.byteOffset, safeData.byteLength / 2);
  const frameCount = dataInt16.length / numChannels;
  
  // 创建 AudioBuffer
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // 归一化 Int16 到 -1.0 ~ 1.0
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}
