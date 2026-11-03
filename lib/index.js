// 角色卡导入插件（local-chara）。
// 扫描手机目录 Download/DSH-Go/cards/ 里的 .json 角色卡（chara_card_v2 兼容），
// 点一张卡：开场白放进输入框（≤2000 字）+ 清洗后的完整设定复制到剪贴板（≤8000 字）。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const name = 'local-chara'

const HOME = process.env.DSH_HOME || process.env.HOME || '/root'
const DIRS = ['/sdcard/Download/DSH-Go/cards', join(HOME, 'dsh-go/cards')]

function cardsDir() {
  for (const d of DIRS) {
    try {
      if (statSync(d).isDirectory()) return d
    } catch {
      /* try next */
    }
  }
  return null
}

// 把角色卡里的 HTML 表格/标签剥掉，变成可读的纯文本。
export function clean(text) {
  return String(text ?? '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(table|tr|td|th|p|div|h[1-6]|li|ul|ol|blockquote)>/gi, '\n')
    .replace(/<td[^>]*>/gi, ' ')
    .replace(/<th[^>]*>/gi, ' ')
    .replace(/<tr[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// 扫描目录，把每张卡解析成 {name, desc, greeting, full, file}。
export function loadCards() {
  const dir = cardsDir()
  if (!dir) return []
  const cards = []
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    try {
      const card = JSON.parse(readFileSync(join(dir, f), 'utf8'))
      const d = card.data || card
      const name = String(d.name || f.replace(/\.json$/, ''))
      const desc = clean(d.displayDesc || d.description || '')
      const greeting = (Array.isArray(d.alternate_greetings) && d.alternate_greetings[0]) || d.first_mes || ''
      const book = (d.character_book && d.character_book.entries) || []

      const parts = []
      if (d.displayDesc) parts.push(`【简介】\n${clean(d.displayDesc)}`)
      if (d.description) parts.push(`【设定】\n${clean(d.description)}`)
      if (d.personality) parts.push(`【性格】\n${clean(d.personality)}`)
      if (d.post_history_instructions) parts.push(`【输出规则】\n${clean(d.post_history_instructions)}`)
      if (book.length) {
        const rows = ['【世界书】']
        for (const e of book) {
          const c = clean(e.content || '')
          if (c) rows.push(`• ${clean((e.keys || []).join(' / ') || '规则')}：${c}`)
        }
        if (rows.length > 1) parts.push(rows.join('\n'))
      }

      cards.push({
        name,
        desc: desc.slice(0, 120),
        greeting,
        full: parts.join('\n\n').slice(0, 8000),
        file: f,
      })
    } catch {
      /* skip malformed card */
    }
  }
  return cards
}

export function apply(ctx) {
  ctx.inject(['dshGo'], (ctx) => {
    ctx.dshGo.on('opencards', () => ({ open: 'panel:cards' }))

    ctx.dshGo.panel('cards', {
      view: () => {
        const cards = loadCards()
        const dir = cardsDir() || ''
        return {
          type: 'stack',
          title: '角色卡',
          children: [
            {
              type: 'callout',
              tone: 'info',
              text: `卡片放在手机 Download/DSH-Go/cards/ 里。点一张卡＝开场进输入框＋设定复制到剪贴板；换卡就把新 JSON 放进去。`,
            },
            {
              type: 'list',
              items: cards.map((c) => ({
                title: c.name,
                subtitle: c.desc.replace(/\s+/g, ' ').slice(0, 60) || '（无简介）',
                icon: 'book',
                action: { id: 'use', args: { file: c.file } },
              })),
            },
            {
              type: 'callout',
              tone: cards.length ? 'good' : 'warn',
              text: cards.length ? `共 ${cards.length} 张卡。开场只含人设摘要＋开场白；完整设定在剪贴板，先粘贴发送再发开场。` : `目录里还没有卡：把角色卡 JSON 放进 ${dir}（或直接把文件发给助手）。`,
            },
          ],
        }
      },
      actions: {
        use: (scope, event) => {
          const file = String(event.value?.file ?? '')
          const cards = loadCards()
          const c = cards.find((x) => x.file === file)
          if (!c) return { toast: '找不到这张卡，稍后再试' }

          const desc = (c.desc || '角色').replace(/\s+/g, ' ').slice(0, 120)
          const greeting = clean(c.greeting) || '（卡里没有开场白，请直接开始）'
          const starter =
            `（以下是一次角色扮演。你是「${c.name}」：${desc}）\n\n` +
            `【开场白】\n${greeting}\n\n` +
            `【扮演要求】\n` +
            `1. 以 ${c.name} 的视角演出，第三人称写言行与神态，不替用户说话、不读用户心思。\n` +
            `2. 对白与心理按角色设定，动作神态写细；卡里有字数要求就按卡的来。\n` +
            `3. 若设定要求输出状态栏/状态块，请照做。\n` +
            `4. 完整设定已复制到剪贴板：新对话里先粘贴发送，再发这句开场。`
          return {
            insert: starter.slice(0, 2000),
            copy: c.full,
            toast: '开场已放入输入框；设定已复制',
          }
        },
      },
    })
  })
}
