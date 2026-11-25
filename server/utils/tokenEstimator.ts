// server/utils/tokenEstimator.ts
export function estimateTokens(text: string): number {
  if (!text) return 0
  // 粗略估算：汉字算 1.5 个 token，其他字符（英文/标点）算 0.3 个 token
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const otherChars = text.length - chineseChars
  return Math.ceil(chineseChars * 1.5 + otherChars * 0.3)
}