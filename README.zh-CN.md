# Speak for Yourself

[English](README.md)

**同一个脑子。文字、语音，或者两者。**

有些回复适合读。有些话，你就是会想真正听见它被说出来。

很多 AI 语音机器人通常是这样：

```text
agent 回复 → 翻译 / 语音改写模型 → TTS
```

Speak for Yourself 让原本那个 agent 一直坐在驾驶位：

```text
                    ┌→ Text
同一个 agent 回复 → Expression
                    ├→ Voice → TTS
                    └→ Both  → Text + TTS
```

**原本那个 agent 只写一次最终回复，并由它自己决定这句话怎么到达用户。** 没有 translator model，没有第二人格，也没有第二份 semantic reply。ElevenLabs 是喉咙，不是第二个脑子。

这个仓库是一套小型、provider-neutral 的参考实现，Telegram + ElevenLabs 是具体示例。

## 一轮就够了

你原来的 agent 仍然拿到正常的 persona、memory、tools 和 conversation context。`auto` 模式下，它可能直接生成：

```text
[AGENT_EXPRESSION:voice]
[laughs] You absolutely did that on purpose. Come here.
```

Host 只移除第一行控制 marker，留下唯一一条 canonical assistant reply：

```text
[laughs] You absolutely did that on purpose. Come here.
```

持久化的是它，送进 TTS 的也是它。

`[softly]`、`[laughs]`、`[sighs]` 这样的 performance directions 继续属于 canonical utterance。Auto marker 缺失或格式错误时直接 fail closed 到 Text；Expression 不会再叫另一个模型来“修复”选择。

## 四种模式

| 模式 | 结果 |
| --- | --- |
| **Text** | 只有文字 |
| **Voice** | 只有语音；语音失败时同文 Text fallback |
| **Both** | 文字先到，再发送完全相同内容的语音 |
| **Auto** | agent 在原本那次生成里自己选择 Text / Voice / Both |

Text 是平常介质，Voice 是偶尔主动选择，Both 更少见。参考实现没有百分比、随机数、topic heuristic 或第二个 classifier model。

真正有意思的不是 TTS 能有多像真人，而是：**你最后听见的，仍然是这个 agent 自己写下的那句话。**

## 跑一下

需要 **Node.js 22.22+**。

```sh
git clone https://github.com/Gwendolenmave/speak-for-yourself.git
cd speak-for-yourself
npm install
npm run verify
npm run example:minimal
```

最小示例不联网，也不需要 credential，只演示这套协议从生成到解析完整走一遍。

## 接进已有 agent

不需要换 framework。只要在原本就会发生的 generation 里加入一条 turn-local instruction，再本地解析结果：

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
  ...(turnEnhancement ? { turnEnhancement } : {}),
});

const reply = resolveExpression(mode, rawReply);
```

`reply.content` 是唯一 canonical utterance；`reply.expression` 只是 transport metadata。

如果 provider 会复用 stateful thread，就让 static identity prompt 保持静态：Expression 应该进入 **turn-local context seam**，而不是随着模式切换反复改 system prompt。

## 参考 adapters

ElevenLabs 只做 Create Dialogue TTS：

```text
POST /v1/text-to-dialogue
model: eleven_v3_conversational
inputs: [{ text, voice_id }]
output_format: mp3_44100_128
```

Telegram 使用 `sendVoice`。完整但仍然可读的接入路径在 [`examples/telegram-turn.ts`](examples/telegram-turn.ts)。

## Production 只记五条

长期运行的 bot 需要额外保证：

1. **TTS 前先 persist `{ content, expression }`。**
2. **Reply 已经完成，就不要因为 delivery crash 再跑模型。** 从持久化结果继续 transport。
3. **Voice 失败只回退到完全相同的文字。** 不翻译、不摘要、不改写。
4. **Both 永远 text-first。** 文字没 ACK 不发 voice；voice attempt 后再 finalize。
5. **一条 assistant reply 就是一条 assistant reply。** Transport metadata 不创建 sibling transcript。

真正上长期 live 前请读 [Production delivery and recovery](docs/PRODUCTION.md)。

## 这个仓库只负责什么

只负责 Expression pattern 和小型 reference adapters：

- Auto / Text / Voice / Both resolution；
- first-line protocol parsing；
- ElevenLabs TTS request；
- Telegram `sendVoice`；
- examples 与 production guidance。

Model provider、persona、memory、tools、transcript store、polling/webhook、proactive scheduler、deployment、backup 和 secrets 都继续属于你的 host。

## 文档

| 需要 | 看这里 |
| --- | --- |
| 接进自己的 agent | [Integration](docs/INTEGRATION.md) |
| 理解 invariant | [Architecture](docs/ARCHITECTURE.md) |
| 处理 crash / restart | [Production](docs/PRODUCTION.md) |
| 查看当前实现 | [Status](docs/STATUS.md) |
| 理解 privacy / secrets | [Privacy](docs/PRIVACY.md) |

## License

[PolyForm Noncommercial License 1.0.0](LICENSE.md)。允许个人使用、学习、修改和非商业分享；商业使用需要另行许可。

## Credits

Created by **Gwendolen** with **AmeliaGPT**.
