import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css' // 引入一套代码高亮主题

// 配置 marked 支持代码高亮
marked.use({
  renderer: {
    code({ text, lang }) {
      // 如果模型给了语言（比如 ```ts），就用对应的语法高亮
      const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
      const highlighted = hljs.highlight(text, { language }).value
      return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`
    }
  }
})

// 简易的 HTML 转义，防止 XSS（清洗掉脚本标签）
function escapeHtml(html: string): string {
  return html
    .replace(/<script[^>]*>([\S\s]*?)<\/script>/gmi, '')
    .replace(/<iframe[^>]*>([\S\s]*?)<\/iframe>/gmi, '')
    .replace(/on\w+="[^"]*"/g, '') // 移除所有内联事件，比如 onclick
}

export function renderMarkdown(text: string): string {
  if (!text) return ''
  // 把 Markdown 转成 HTML
  const rawHtml = marked.parse(text) as string
  // 把危险的标签/属性过滤掉
  return escapeHtml(rawHtml)
}