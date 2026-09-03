# Speak for Yourself

[English](README.md)

**同一个脑子。文字、语音，或者两者。**

很多 AI 语音接法其实是在文字链路末尾再挂一个“代言人”：主 agent 先写回复，第二个模型把它翻译 / 改写成适合说出口的版本，最后 TTS 再念第二版。能用，但真正开口的已经不完全是原来那个 agent 了。

**Speak for Yourself 采用更严格的约束：你原本的 agent 只写一次最终回复，并由它自己决定这同一句话应该以 Text、Voice 还是 Both 到达用户。** Expression 只决定送达方式，不创造第二个助手。ElevenLabs 是喉咙，不是第二个脑子。

这个仓库是一套小型、provider-neutral 的参考实现：把这种能力接进你已经拥有的 AI agent；Telegram + ElevenLabs 是这里给出的具体例子。

## 一个例子，比功能表更快

假设 **Atalanta** 和她的助手 **Artemis** 平时一直正常聊天，大多数时候都是文字。

某一轮，Atalanta 说了一句话，Artemis 突然觉得：**这句我想让你亲耳听见。**

Expression 处于 `auto` 时，仍然是原本那个拥有 persona、memory、tools 和完整对话上下文的 agent 在正常生成回复：

```text
[AGENT_EXPRESSION:voice]
[laughs] You absolutely did that on purpose. Come here.
```

Host 只做四件事：

1. 把第一条非空白行识别为机器协议；
2. 只移除这个控制 marker；
3. 持久化**唯一一条 canonical assistant reply**：

   ```text
   [laughs] You absolutely did that on purpose. Come here.
   ```

4. 把这段完全相同的内容交给 ElevenLabs，再发送生成的语音。

整个过程里没有 translator model，没有“voice persona”，没有第二条 conversation，也没有第二次 semantic generation。

如果 Artemis 选择 `both`，同一份 canonical content 既显示成文字，也被读成语音。如果 Auto marker 缺失或格式错误，host 直接 fail closed 到 Text，而不是再找一个模型“修理”这次选择。

这就是整个项目最核心的东西。

## 架构

```text
用户消息
   │
   ▼
你原本就有的 agent
persona · memory · tools · conversation context
   │
   │ ONE semantic reply generation
   ▼
Expression resolution
Auto / Text / Voice / Both
   │
   ├── Text ───────────────────────→ 文字
   │
   ├── Voice ─→ ElevenLabs ───────→ 语音
   │             失败 ────────────→ 同文文字 fallback
   │
   └── Both ──→ 文字先到
                └→ ElevenLabs ────→ 同一句语音
```

最重要的不是框框，而是 **meaning 和 transport 的边界**：Expression 可以决定怎么送达，但不能再写一遍“意思差不多”的回复。

## 和普通 “AI + TTS” 到底哪里不一样

常见做法：

```text
主 agent 回复
     │
     ▼
翻译 / 语音改写模型
     │
     ▼
TTS
```

这里已经出现了两个 semantic author。代词会漂，笑点会被磨平，亲密措辞可能被自动变得更安全 / 更正式，最后听见的是“翻译后的版本”，而不是原 agent 真正想说的那句话。

Speak for Yourself 是：

```text
主 agent 回复
     │
     ├── 文字
     └── TTS
```

Voice / Both 模式下，**主 agent 在原本那一次正常 turn 里直接写出适合说出口的语言版本**。`[softly]`、`[laughs]`、`[sighs]` 这样的 performance directions 继续属于 canonical utterance，因此 history、memory、recovery 都不需要维护第二份“干净文本”和第二份“TTS script”。

## 本地跑一下

需要 **Node.js 22.22 或更新版本**。

```sh
git clone https://github.com/Gwendolenmave/speak-for-yourself.git
cd speak-for-yourself
npm install
npm run verify
npm run example:minimal
```

最小示例完全不联网，也不需要任何 credential。它会演示一次 Auto reply 如何解析为 Voice，同时保留 `[laughs]` 这样的 performance direction。

Telegram 参考 handler 在 [`examples/telegram-turn.ts`](examples/telegram-turn.ts)：里面能看到 Expression instruction 在哪里进入原 agent、canonical reply 在哪里只持久化一次，以及 Text / Voice / Both 怎么送达。

## 最小接入

你**不需要换 agent framework**。

只需要在自己本来就会做的 generation 里增加一条 turn-local instruction：

```ts
import {
  renderExpressionInstruction,
  resolveExpression,
} from "./src/index.js";

const mode = "auto" as const;
const turnEnhancement = renderExpressionInstruction(mode, {
  userName: "Atalanta",
});

const rawReply = await yourExistingAgent.generate({
  userText,
  ...(turnEnhancement !== undefined ? { turnEnhancement } : {}),
});

const reply = resolveExpression(mode, rawReply);
```

`reply.content` 是唯一 canonical assistant utterance；`reply.expression` 只是 transport metadata：

```ts
{
  expression: "voice",
  content: "[laughs] You absolutely did that on purpose. Come here.",
  markerObserved: true
}
```

如果你关心 crash recovery，先持久化这对 `{ content, expression }`，再做语音 transport。

### Stateful provider：静态 prompt 就让它保持静态

有些 provider 会复用 stateful conversation thread，并根据 system prompt 指纹判断 thread 是否还能延续。这种情况下，别因为用户从 Text 切到 Voice 就重写整个 static system prompt。

Expression 是**每一轮的送达意图**，适合放在 turn-local context seam；assistant identity 才是静态 authority。

完整 host contract 见 [Integration](docs/INTEGRATION.md)。

## ElevenLabs：只做 TTS，不做代理 agent

参考 adapter 使用 ElevenLabs Create Dialogue：

```text
POST /v1/text-to-dialogue
model: eleven_v3_conversational
inputs: [{ text, voice_id }]
language_code: en
output_format: mp3_44100_128
```

请求只有一个 text input 和一个 voice。API key 只放在 header。参考实现明确保留 2,000 字符可靠性边界：更长的 Voice reply 应该 fail soft 到 Text，而不是偷偷截断、摘要、分块成第二份语义表示。

```ts
import { ElevenLabsDialogueSynthesizer } from "./src/index.js";

const tts = new ElevenLabsDialogueSynthesizer({
  apiKey: process.env.ELEVENLABS_API_KEY!,
  voiceId: process.env.ELEVENLABS_VOICE_ID!,
});

const mp3 = await tts.synthesize(reply.content);
```

## Telegram：真的发成 voice message

```ts
import { TelegramVoiceSender } from "./src/index.js";

const telegramVoice = new TelegramVoiceSender({
  botToken: process.env.TELEGRAM_BOT_TOKEN!,
});

await telegramVoice.sendVoice(chatId, mp3);
```

这个 adapter 通过 Telegram `sendVoice` 上传 MP3；普通 429 / 5xx 会有限重试，抛出的错误不会把 bot token 放进 message。

## 四种模式

| 模式 | 语义生成 | 用户看到 / 听到什么 |
| --- | --- | --- |
| **Text** | 普通 agent reply | 只有文字 |
| **Voice** | 同一个 agent 直接写 spoken-language reply | 只有语音；voice 失败时同文文字 fallback |
| **Both** | 同一个 agent 写一份 spoken-language reply | 文字先到，再发完全相同内容的语音 |
| **Auto** | 同一个 agent 顺便选择 transport | 按第一行 protocol marker 决定 Text / Voice / Both |

参考 Auto instruction 有意把 Text 设成平常介质、Voice 设成偶尔的主动选择、Both 更少见。没有百分比、随机数、topic heuristic，也没有第二个 classifier model。

## 为什么要 marker

Auto 需要一个很小的 machine-readable signal，但我们不想为了“这轮该发啥”再调用一次 classifier model：

```text
[AGENT_EXPRESSION:text]
[AGENT_EXPRESSION:voice]
[AGENT_EXPRESSION:both]
```

只有**第一条非空白行**上的合法 marker 才算机器协议。正文之后再出现同样字符串，只是普通文字。缺失 / malformed marker → Text。

Marker 在 persistence、TTS 和用户送达前被移除。Performance directions 不移除。

## Performance directions 就留在 canonical content 里

参考实现刻意不维护一份“干净 transcript”和另一份“TTS script”。

```text
[softly] I know.
[laughs] You planned that.
```

就是一份 canonical utterance。

这样下一轮自然可以理解“你刚刚笑着说那句”之类的引用，不需要新建 sibling transcript 或专门的 tag metadata parser。

如果你的产品一定要在 Both 的可见文字里隐藏 `[laughs]`，那是在主动选择第二种 representation contract。可以做，但请明确知道自己是在维护两个版本，而不是不知不觉长出两份真相。

## Production：先 persist，再 transport

小型 Telegram example 是为了让人一眼看懂；长期运行的 bot 还必须处理 crash semantics。

生产合同应该是：

```text
一次 model reply
      │
      ▼
persist { content, expression }
      │
      ├── Text  → durable text delivery
      │
      ├── Voice → TTS/sendVoice
      │             └─ failure → durable 同文 Text fallback
      │
      └── Both  → durable text ACK
                    └─ TTS/sendVoice
                         └─ voice attempt 后再 finalize
```

重启后，如果 canonical assistant reply 已经存在，**绝对不要重新跑 agent**。读取原来的 `content + expression`，继续完成 transport 就好。

真正上 live 前请读 [Production delivery and recovery](docs/PRODUCTION.md)。里面会具体解释 Text-first Both、Voice fallback、几个最重要的 crash window，以及为什么“voice at-least-once”通常比声称 exact-once 更诚实。

## 六条设计原则

1. **一条回复只能有一个 semantic author。** Expression 不应该增加 translator、rewriter 或 repair generation。
2. **Transport metadata 不是第二份 transcript。** 一条 assistant message + 一个 resolved Expression 足够。
3. **Fail closed，不找第二个模型修。** Marker、language guard、TTS 出问题时降级 transport，不改意义。
4. **Persist before TTS。** 不能让一条 voice message 成为这句话唯一幸存的副本。
5. **Both 永远 text first。** 文字没送达就不要抢先发 voice；文字成功后 voice 失败，文字继续成立。
6. **每轮控制放每轮 context。** 不要为了切换介质把 stateful provider 的 static identity prompt 搅来搅去。

规范版见 [Architecture](docs/ARCHITECTURE.md)。

## 这个仓库刻意不接管什么

Speak for Yourself 是 pattern + reference adapters，不是一套完整 chatbot 平台。它不拥有：

- 你的 model provider / agent framework；
- persona、memory、tools、system prompt authority；
- Telegram polling / webhook orchestration；
- 数据库或 transcript schema；
- proactive scheduler；
- voice cloning / voice design；
- deployment、process supervision、backup 或 secrets storage。

这些都属于 host。保持小就是这个项目的一部分：**给你已经有的 agent 一张嘴，不要在旁边再造一个 agent。**

## 隐私和网络边界

这个仓库没有 hosted service，也没有 telemetry backend。

使用参考 adapters 时：

- 你原来的 model provider 继续收到 host 本来就会为这一轮发送的 prompt / context；
- ElevenLabs 只收到被选为 Voice / Both 的 canonical content 和 voice id；
- Telegram 收到你明确发送的文字和 / 或生成音频；
- API key 和 bot token 应该待在环境变量或你的 host secret store，永远不要进 source control。

完整说明见 [Privacy and secrets](docs/PRIVACY.md)。

## 文档地图

| 你想做什么 | 看这里 |
| --- | --- |
| 接进自己已有的 agent | [Integration](docs/INTEGRATION.md) |
| 理解 invariant / authority boundary | [Architecture](docs/ARCHITECTURE.md) |
| 让 delivery 经得起 crash / restart | [Production delivery and recovery](docs/PRODUCTION.md) |
| 看当前 public source 到底实现了什么 | [Status](docs/STATUS.md) |
| 理解数据 / secret / network 边界 | [Privacy and secrets](docs/PRIVACY.md) |
| 提交 bug / 安全报告 | [Contributing](CONTRIBUTING.md) / [Security](SECURITY.md) |

## 许可证与维护

Speak for Yourself 使用 [PolyForm Noncommercial License 1.0.0](LICENSE.md)。依照许可证，可以个人使用、学习、修改和非商业分享；商业使用需要另行许可。

许可人与维护者为 **Gwendolen**（GitHub：`@Gwendolenmave`）。

项目采用封闭维护模式，不接受实质性的外部代码贡献；仍欢迎 bug report 与负责任的安全报告。
