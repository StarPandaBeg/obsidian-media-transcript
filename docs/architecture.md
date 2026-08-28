# 插件架构

> 定位：**纯字幕播放器**。在 Obsidian 里打开音视频，读取同目录的现成字幕
> （`json` / `srt` / `vtt`）做同步、可点击、跟读高亮。**不含任何语音转文本功能**
> —— 字幕由外部工具（如 `local-asr`）预先生成。

## 文件结构

```
obsidian-media-transcript/
├── manifest.json           # Obsidian 插件元信息
├── package.json
├── tsconfig.json
├── esbuild.config.mjs      # 构建配置
├── styles.css              # 所有 UI 样式
├── main.js                 # 构建产物（发布/部署用）
├── src/
│   ├── main.ts             # 插件入口：注册视图、接管媒体扩展名、设置页
│   ├── MediaTranscriptView.ts  # 主视图（播放器 + 字幕面板 + 交互）
│   ├── settings.ts         # 设置类型 + 设置页面 UI
│   └── utils/
│       ├── subtitleFinder.ts   # 按命名约定查找字幕文件
│       └── subtitleParser.ts   # 解析 SRT / VTT / JSON
└── docs/
    └── architecture.md     # 本文件
```

## 数据流

```
用户打开 .mp4 / .m4a / .mp3 …
       ↓
MediaTranscriptView.onLoadFile()
       ↓  isVideo?
   ┌───────────────┴────────────────┐
   视频：左右并排                    音频：顶部细控制条
   playerSide(可拖分隔线) + transcript   audioBar(🎵+播放器+倍速) + 整宽 transcript
       └───────────────┬────────────────┘
       ↓
  findSubtitleFiles()  ──→  同目录按 [name].[marker].[ext] 扫 vault
       ↓
  resolvePriority()    ──→  排序（首项自动加载；当前为直通，可扩展）
       ↓
  loadTrack() → 读文件 → parseSubtitle() → renderSegments()
       ↓
  HTML5 media 元素            字幕段落列表
    timeupdate ──────────────→ syncHighlight()（高亮当前段 + 居中滚动）
```

若同目录没有对应字幕 → 显示"未找到字幕"提示，不做其它动作。

## 布局与交互

- **视频**：播放器在左（填满栏宽、`max-height:75vh`、吸顶），字幕在右；中间
  `.mt-divider` 可拖动调整比例，结果存入 `settings.playerWidthPercent`（默认 75%，设置页也有滑杆）。
- **音频**：无画面 → 顶部一条 `.mt-audio-bar`（🎵 标题 + 原生播放器 + 倍速），
  字幕占满整宽。
- **倍速**：`0.75/1/1.25/1.5/2x`，设置 `mediaEl.playbackRate`（视频音频通用）。
- **字号**：字幕工具栏 `A− / A+`（步进 1px，范围 10–32），写入
  `settings.transcriptFontSize`，通过 `.mt-transcript` 上的 `--mt-font-size`
  行内变量生效；时间戳/说话人小块用 `em` 相对缩放。设置页滑杆改的是同一个值，
  两处都会 `applyFontSizeToOpenViews()` 实时应用到所有已打开视图。
- **自动滚动**：`scrollActiveIntoCenter()` 把当前段滚到面板**垂直居中**
  （用 `offsetTop`，因此 `.mt-transcript` 必须 `position: relative`；末尾
  `padding-bottom: 40vh` 让最后几段也能居中）。用户 `wheel/touchmove` 手动滚动后
  暂停 4s（`MANUAL_SCROLL_GRACE_MS`），点击段落立即恢复；可用
  `settings.autoScroll` 整体关闭（关闭后仍高亮）。
- **搜索**：工具栏下面一行 `.mt-searchbar`（输入框 + `n/m` 计数 + ↑/↓）。
  `applySearch()` 大小写不敏感的子串匹配（CJK 同样可用），把命中段的 `.mt-txt`
  重建成「纯文本 + `span.mt-hit`」交替结构（不用 innerHTML）；`clearHighlights()`
  按 `highlightedSegs` 还原原文。命中列表 `hitEls` 扁平存放每一处，
  `gotoHit()` 标 `.mt-hit-current` 并把所在段滚到居中，同时刷新
  `manualScrollUntil` 避免播放把视图拽走。首次跳转从**当前播放段**往后找，
  找不到就回到第一处；切轨/重渲染后会用当前关键词重跑一次。
  命令 `search-transcript` → `focusSearch()`（可自行绑快捷键）。
- **视频 ⇄ 纯音频**：`settings.videoAudioOnly`（工具栏 🎧/🎬 按钮 + 设置页开关）。
  `buildLayout()` 按当前模式搭布局，`transcriptSideEl` 整列**移动复用**，
  所以切换不重新解析字幕、不丢搜索结果和滚动位置；`rebuildPlayer()` 只换播放器，
  把 `currentTime / playbackRate / paused` 搬过去（新元素 `readyState === 0` 时
  推迟到 `loadedmetadata` 再 seek）。纯音频模式用 `<audio>` 播视频文件（同一套解码器），
  万一某容器不支持会触发 `error` → Notice 提示并自动退回视频模式。
- **文字可选**：`.mt-txt` 显式 `user-select: text`（Obsidian 从 `body` 往下继承的是
  `none`，所以必须显式打开）。这样才能划选复制，别的插件也才能在字幕上做标注。
  时间戳/说话人小块保持不可选，免得拖选时把它们一起带上。
  段落的 click→seek 会在**存在选区时跳过**，否则划完文字就被拽走播放位置。
- **对外广播**：每次重建字幕 DOM（换轨、搜索高亮重写 `.mt-txt`）后：
  - 在 `.mt-transcript` 上写 `data-mt-media` / `data-mt-track`
  - 派发冒泡的 `mt:transcript-rendered`（detail 同上）
  - 每段带 `data-mt-seg` / `data-mt-start`

  **两者都要**：事件只能被「当时在听的人」收到，而 DOM 属性任何时候都能读。
  在字幕已经打开之后才被启用的插件收不到事件，只能靠属性。单向，本插件不关心谁在听。
- **播放入口是时间戳，不是整行**：点 `.mt-ts` 才 seek+play。原来点整行会 seek，
  和「选中文字」抢同一个点击 —— 每次想划词或复制都会把播放位置带走。
  按**目标元素**分开比按「有没有选区」猜要可靠。
- **交互**：右键 → 菜单（从此处播放 / 复制时间戳 / 复制文字）；
  点左侧时间块 → 复制时间戳；hover 仅高亮，不弹按钮（不影响布局）。
- **扩展名接管**：`main.ts` 逐个 `registerExtensions`，被其他插件占用时先
  `unregisterExtensions` 再接管，避免冲突导致加载失败。

## 测试

```bash
npm test        # vitest，watch 用 npm run test:watch
```

只测**纯逻辑** —— `utils/subtitleParser.ts`。视图那一层是 DOM 胶水，单测收益低于
维护成本，走手工。但解析器不一样：它决定「这个文件是不是字幕」，错了是**静默**的
（空白行、误导的提示），手工点击恰恰发现不了。

## 开发循环

```bash
npm run dev    # esbuild watch，每次构建后自动复制到 dev vault
```

部署**用复制不用软链** —— 本 repo 在 iCloud Drive 上，把 vault 指向 iCloud 路径
有 Obsidian 卡在被 evict 的文件上的风险。

**部署到哪是这台机器的属性，不是插件的属性**，所以从环境变量 `VAULT_PLUGIN_DIR`
或一个 gitignore 掉的 `.dev-vault` 文件（内容是 vault 根目录）读，两者都没有就
不部署。CI 因此天然跳过，别人 clone 下来也不会莫名其妙往某个不存在的目录写东西。

`styles.css` 不是 esbuild 的输入，所以单独 watch。

构建时会写一个空的 `.hotreload` 标记，装了 pjeby/hot-reload 就能**存盘即重载**，
不用退出 Obsidian。之前一直要手动重启，就是因为少了这个文件 —— hot-reload
只盯带标记的插件目录。

## 字幕文件命名约定

Pattern：`{mediaBasename}[.{marker}].{subExt}`

| 例子 | marker | subExt |
|------|--------|--------|
| `video.srt` | `""` (空) | `srt` |
| `video.vibevoice-4bit.json` | `vibevoice-4bit` | `json` |
| `video.en.vtt` | `en` | `vtt` |

搜索目录：`settings.subtitleDirectory`，留空则为媒体文件同目录。

## 「这是不是字幕」怎么判断

`.json` 是**整个扩展名**被注册的（Obsidian 没法按文件挑），所以各种根本不是字幕的
JSON 都会落到这个视图里 —— 包括 Attention 写的 `<文件>.anno.json`。空状态提示要
区分两种情况，因为建议正好相反：

| 情况 | 该说什么 |
|------|---------|
| 是字幕，但旁边没有媒体 | 把同名音视频放到同目录 |
| 压根不是字幕 | 这个视图只开字幕；你点错文件了 |

**只用一个定义，用在两处**：判断依据就是 `parseSubtitle()` 有没有解析出段落。
另起一套「像不像字幕」的启发式规则，迟早会和真正的解析逻辑漂移。

为此解析器收紧了：**没有文字就不是一行字幕**。原来 `toSegment` 会把任意对象映射成
`text:''` 的空段落，于是 `[{a:1},{b:2}]` 会被当成 2 段字幕 —— 既让分类判断错，
也会在字幕面板里渲染出**可点击的空白行**。现在 `collect()` 丢掉这些再重新编号。

判断只在**出错路径**上读文件，正常打开字幕不受影响。

## 支持的字幕格式

| 格式 | 扩展名 | 说明 |
|------|--------|------|
| SubRip | `.srt` | 最通用，时间码精确到毫秒 |
| WebVTT | `.vtt` | Web 标准，支持样式标签（自动剥离）|
| JSON | `.json` | `{segments:[{start,end,text}]}`（兼容 local-asr / Whisper verbose_json；speaker 字段忽略）|

## 待实现 / 可扩展

- [ ] `resolvePriority()` 目前为直通，可按 marker 优先级排序（多字幕并存时选默认）
- [ ] 键盘快捷键（空格暂停/继续，左右箭头跳句）
- [ ] 在字幕里显示说话人 `[S0]` 前缀（parseJSON 读出 speaker 即可）
