---
pipeline_tag: text-to-speech
language:
  - en
  - es
  - fr
  - hi
  - it
  - ja
  - pt
  - zh
tags:
  - kokoro
  - onnx
  - text-to-speech
---

# Kokoro-82M Text-to-Speech (TTS)

Convert text files into natural, expressive speech audio powered by the **Kokoro-82M** ONNX model.

---

## Quick Start

### 1. Run the script
To convert `input.txt` into `output.wav`:

```bash
python tts.py
```

### 2. Custom Input / Output
Specify custom input text and output filenames:

```bash
python tts.py -i input.txt -o my_audio.wav
```

### 3. Tone Presets (Warm, Welcoming, Story, etc.)
You can pass `--tone` to automatically select curated voice blends and speaking paces:

```bash
# Warm and friendly delivery
python tts.py --tone warm

# Welcoming and gentle delivery
python tts.py --tone welcoming

# Narrative storytelling delivery
python tts.py --tone story
```

### 4. Custom Voice Blending
You can blend any voices together with custom weights:

```bash
# 70% af_heart + 30% af_bella
python tts.py -v "af_heart:70,af_bella:30"
```

### 5. List All Available Voices & Presets
To see all voices and presets:

```bash
python tts.py --list-voices
```

---

## Popular Voices

| Category | Recommended Voices |
| :--- | :--- |
| **American English (Female)** | `af_heart` (Default, Flagship), `af_bella`, `af_sarah`, `af_nicole` |
| **American English (Male)** | `am_adam`, `am_echo`, `am_michael`, `am_onyx` |
| **British English (Female)** | `bf_emma`, `bf_isabella`, `bf_alice`, `bf_lily` |
| **British English (Male)** | `bm_george`, `bm_lewis`, `bm_fable`, `bm_daniel` |
| **Spanish** | `ef_dora`, `em_alex` |
| **French** | `ff_siwis` |
| **Hindi** | `hf_alpha`, `hm_omega` |
| **Italian** | `if_sara`, `im_nicola` |
| **Japanese** | `jf_alpha`, `jm_kumo` |
| **Portuguese** | `pf_dora`, `pm_alex` |
| **Mandarin Chinese** | `zf_xiaobei`, `zm_yunjian` |

---

## CLI Options

| Argument | Flag | Default | Description |
| :--- | :--- | :--- | :--- |
| `--input` | `-i` | `input.txt` | Path to the input text file |
| `--output` | `-o` | `output.wav` | Destination path for the `.wav` audio file |
| `--tone` | `-t` | None | Tone preset (`warm`, `welcoming`, `story`, `calm`, `energetic`) |
| `--voice` | `-v` | `af_heart` | Voice name or blend (e.g. `af_heart` or `af_heart:70,af_bella:30`) |
| `--speed` | `-s` | `1.0` | Speech speed multiplier (`0.5` to `2.0`) |
| `--lang` | `-l` | Auto | Language code (e.g. `en-us`, `en-gb`, `es`, `fr-fr`, `hi`, `it`, `ja`, `pt-br`, `zh`) |
| `--list-voices` | | | Print all available voices and tone presets, then exit |

## Mobile App Deployment Bundle

An ONNX bundle pre-packaged for Android, iOS, Flutter, and React Native is generated inside the [`mobile_bundle/`](file:///d:/ReadMe/mobile_bundle) directory:

- Embeds `TONE_PRESETS`, `CATEGORY_NAMES`, `VOICE_LANG_MAP`, and `TOKENIZER_VOCAB` directly inside the `.onnx` binary metadata.
- Includes `kokoro_mobile_int8.onnx` (~88 MB, quantized 8-bit for mobile performance).
- Includes `voices_mobile.bin` with pre-baked tone presets (`tone_warm`, `tone_welcoming`, `tone_story`, `tone_calm`, `tone_energetic`).
- Standalone `kokoro_metadata.json` for drag-and-drop mobile assets.

To re-export or update the mobile bundle at any time:
```bash
python export_mobile_bundle.py
```
See [`mobile_bundle/README.md`](file:///d:/ReadMe/mobile_bundle/README.md) for full Kotlin, Swift, and Flutter integration examples.

---

## Files in this Directory

- [`tts.py`](file:///d:/ReadMe/tts.py): Main Python conversion script.
- [`export_mobile_bundle.py`](file:///d:/ReadMe/export_mobile_bundle.py): Generator script to build the mobile ONNX package.
- [`mobile_bundle/`](file:///d:/ReadMe/mobile_bundle): Directory containing mobile-ready ONNX models and assets.
- [`input.txt`](file:///d:/ReadMe/input.txt): The text file converted to speech.
- [`output.wav`](file:///d:/ReadMe/output.wav): The synthesized audio file.
- [`kokoro-v1.0.onnx`](file:///d:/ReadMe/kokoro-v1.0.onnx): The Kokoro-82M model graph (FP32).
- [`kokoro-v1.0.int8.onnx`](file:///d:/ReadMe/kokoro-v1.0.int8.onnx): Quantized INT8 model graph (~88 MB).
- [`voices-v1.0.bin`](file:///d:/ReadMe/voices-v1.0.bin): The base voice embeddings binary file.
- [`requirements.txt`](file:///d:/ReadMe/requirements.txt): Python dependencies (`kokoro-onnx`, `soundfile`, `onnx`).
