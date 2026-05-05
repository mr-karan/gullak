# On-device Gemma for SMS parsing — design notes

> Research log. The cloud `LlmSmsParser` was shipped first; this is a
> Phase-2 evaluation for a privacy-mode follow-up. The architecture
> uses a single `SmsParser` interface in `lib/data/sms/sms_parser.dart`,
> so a `GemmaSmsParser` slots in next to `LlmSmsParser` with no other
> changes.

## What flutter_gemma actually gives you

Wraps Google's **MediaPipe LLM Inference** task. Models are `.task`
bundles (TFLite-converted Gemma weights, distributed by Google via
HuggingFace LiteRT). Surface is small: load a `.task` file →
`inference.generateResponse(prompt)` returns a string. Both Android
(mature) and iOS (newer, fewer real-world deployments) supported.

## Model options on a Pixel 9 Pro XL

| Model | Disk | RAM resident | Latency / parse | Quality on structured JSON |
|---|---|---|---|---|
| Gemma 3 270M | ~270 MB | ~250 MB | 0.5–1 s | Iffy. Often skips fields, hallucinates payee names. Needs heavy prompt engineering + post-validation. |
| Gemma 3 1B | ~1 GB | ~700 MB | 1–2 s | Decent. Probably 85–90% accuracy on bank SMS extraction with a tight prompt. |
| Gemma 2 2B | ~1.5 GB | ~1.2 GB | 2–3 s | Best on-device option. ~90–95%. |
| **Gemini 3 Flash (cloud, current)** | 0 | 0 | ~0.5 s | ~95–98% with the current system prompt. |

## Real costs people don't talk about

- **APK can't ship the model** (Play Store size limit + iOS App Store
  limit). First-use download with explicit prompt: "Privacy mode needs
  ~1 GB. Continue?"
- **Cold-start latency** ~5–10 s loading the model into NPU memory
  after each app start. To keep parsing live SMS responsive you have
  to keep the model warm — i.e. ~700 MB resident the whole time the
  app is alive.
- **Battery**. NPU inference per SMS draws ~3–5× more than the
  negligible network/CPU of a cloud call. For 30 SMS/day this is
  rounding error; for someone whose phone gets 200 SMS/day it's a
  noticeable hit.
- **Quality regression of 5–10 percentage points**. For a financial
  extraction task, that means more low-confidence candidates landing
  in Inbox for manual review. Annoying but not wrong — the
  auto-confirm threshold backstops correctness.

## Phasing recommendation

**Phase 1 (shipped):** cloud `LlmSmsParser` + body-template cache.
Cache amortises to ~free for known formats; first-of-format costs
~$0.0001.

**Phase 2 (when asked):** `GemmaSmsParser` as an opt-in **privacy
mode** in `Settings → SMS → On-device parsing only`. Picks Gemma 3 1B
as the default (best size/quality tradeoff; 1 GB is tolerable). Shows
a one-time download dialog. Falls back to "leave in Inbox" on
confidence < threshold rather than escalating to cloud — that defeats
the privacy point.

**Phase 3 (probably never needed for personal use):** model
auto-update channel so you can swap to Gemma 3.5 / Gemma 4 without an
APK update.

## "Should I bother"

Bank SMS contains last-4-card and amount, not full PAN. The privacy
delta from "OpenRouter sees this" to "nothing leaves the device" is
real but small for the data we're sending. Run the cloud path for a
few weeks first; build Gemma as a follow-up rather than holding up
the rollout.

## Implementation sketch (when Phase 2 lands)

```dart
// lib/data/sms/gemma_sms_parser.dart
import 'package:flutter_gemma/flutter_gemma.dart';

class GemmaSmsParser implements SmsParser {
  GemmaSmsParser._(this._inference);
  final InferenceModel _inference;

  static Future<GemmaSmsParser?> tryLoad() async {
    final mgr = FlutterGemmaPlugin.instance.modelManager;
    if (!await mgr.isModelInstalled) return null;
    final model = await FlutterGemmaPlugin.instance.createModel(
      modelType: ModelType.gemmaIt,
      preferredBackend: PreferredBackend.gpu,
      maxTokens: 512,
    );
    return GemmaSmsParser._(model);
  }

  @override
  Future<SmsCandidate?> parse(IncomingSms sms) async {
    final session = await _inference.createSession();
    try {
      final prompt = _buildPrompt(sms);
      final raw = await session.getResponse(prompt);
      return _parseJson(raw, sms);
    } finally {
      await session.close();
    }
  }
}
```

A `prefs.smsParseLocal` toggle and a model-download wizard (with
progress UI) are the two non-trivial UX pieces.
