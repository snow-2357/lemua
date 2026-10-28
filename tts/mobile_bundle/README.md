# Kokoro-82M Mobile Bundle: Complete User & Developer Guide

This directory contains the mobile-optimized deployment package of **Kokoro-82M Text-to-Speech (TTS)** for **Android**, **iOS**, **Flutter**, and **React Native**.

All essential application metadata—including **`TONE_PRESETS`**, **`CATEGORY_NAMES`**, **`VOICE_LANG_MAP`**, **`AVAILABLE_VOICES`**, **`SAMPLE_RATE`**, and **`TOKENIZER_VOCAB`**—are **embedded directly into the ONNX model binary header**.

---

## Table of Contents
1. [Files in this Bundle](#files-in-this-bundle)
2. [Quick Test: How to Run on PC/Mac](#quick-test-how-to-run-on-pcmac)
3. [Complete Catalog of Options](#complete-catalog-of-options)
   - [Model Options](#1-model-options)
   - [Tone Preset Options](#2-tone-preset-options)
   - [Base Voice Options (54 Voices)](#3-base-voice-options-54-voices)
   - [Inference Parameter Options](#4-inference-parameter-options)
   - [Mobile Acceleration Options (Execution Providers)](#5-mobile-acceleration-options)
4. [Embedded Metadata Reference](#embedded-metadata-reference)
5. [Mobile Integration Step-by-Step](#mobile-integration-step-by-step)
   - [Android (Kotlin)](#android-kotlin-implementation)
   - [iOS (Swift)](#ios-swift-implementation)
   - [Flutter (Dart)](#flutter-dart-implementation)
6. [ONNX Tensor Contract (Inputs & Outputs)](#onnx-tensor-contract-inputs--outputs)

---

## Files in this Bundle

| File | Size | Role | Description |
| :--- | :--- | :--- | :--- |
| **`kokoro_mobile_int8.onnx`** | **~88 MB** | **Primary Mobile Model** | **Recommended for mobile**. 8-bit quantized ONNX graph with embedded metadata. Low RAM footprint and near-instant cold start. |
| **`kokoro_mobile.onnx`** | ~310 MB | High-Fidelity Model | Full-precision FP32 ONNX graph for high-end devices or desktop apps. |
| **`voices_mobile.bin`** | ~27 MB | Mobile Voice Pack | 54 original voices **+ 5 pre-baked tone presets** (`tone_warm`, `tone_welcoming`, `tone_story`, `tone_calm`, `tone_energetic`). |
| **`kokoro_metadata.json`** | ~5 KB | Standalone Config | JSON copy of all embedded metadata for apps that prefer JSON asset files. |
| **`run_mobile.py`** | ~4 KB | Test Runner CLI | Quick script to verify, benchmark, and test the mobile bundle locally before deploying. |

---

## Quick Test: How to Run on PC/Mac

Before copying files into an Android Studio or Xcode project, test and verify the bundle locally:

### 1. Basic Test (Uses Default INT8 & `tone_warm`)
```powershell
python mobile_bundle/run_mobile.py -i "Hello from the mobile Kokoro model!"
```

### 2. Test Tone Presets
```powershell
# Welcoming, smooth tone:
python mobile_bundle/run_mobile.py -v tone_welcoming -i "Welcome to our mobile application!"

# Storyteller tone:
python mobile_bundle/run_mobile.py -v tone_story -i "Once upon a time in a distant land..."

# Energetic tone:
python mobile_bundle/run_mobile.py -v tone_energetic -i "Breaking news! You won the grand prize!"
```

### 3. Test from a Text File
```powershell
python mobile_bundle/run_mobile.py -v tone_warm -i input.txt -o test_output.wav

python mobile_bundle/run_mobile.py -v af_bella -s 1.15 -i input.txt -o fast_bella.wav
```

### 4. Inspect Embedded ONNX Metadata
View all embedded metadata keys and JSON strings stored inside the model binary:
```powershell
python mobile_bundle/run_mobile.py --show-metadata
```

---

## Complete Catalog of Options

### 1. Model Options

| Model | File | File Size | Memory (RAM) | Target Devices |
| :--- | :--- | :--- | :--- | :--- |
| **INT8 (Quantized)** | `kokoro_mobile_int8.onnx` | **88 MB** | ~150–250 MB | **All mobile devices** (Android 8+, iOS 14+, mid-range & flagship phones). |
| **FP32 (Full)** | `kokoro_mobile.onnx` | 310 MB | ~450–600 MB | Tablets, iPads, desktop apps, or devices with ample storage. |

---

### 2. Tone Preset Options

These are **pre-baked directly into `voices_mobile.bin`**. Mobile applications can request them as simple voice names without doing any runtime vector math:

| Preset Name | Timbre & Style | Underlying Voice Blend | Recommended Speed | Best Used For |
| :--- | :--- | :--- | :--- | :--- |
| **`tone_warm`** | Warm, friendly, conversational | 65% `af_heart` + 35% `af_bella` | `0.95x` | Customer service, podcasting, daily assistant |
| **`tone_welcoming`** | Gentle, soothing, friendly | 70% `af_heart` + 30% `af_sarah` | `0.95x` | Onboarding, meditation, welcome greetings |
| **`tone_story`** | British narrative storytelling | 100% `bm_fable` | `0.95x` | Audiobooks, story reading, long-form articles |
| **`tone_calm`** | Peaceful, soft, relaxed | 100% `af_heart` | `0.90x` | Sleep apps, wellness, mindful reading |
| **`tone_energetic`** | Upbeat, vibrant, dynamic | 60% `af_bella` + 40% `af_nova` | `1.05x` | Gaming, sports commentary, urgent alerts |

---

### 3. Base Voice Options (54 Voices)

All original 54 Kokoro-82M voices are present in `voices_mobile.bin`:

| Language / Accent | Code | Voices Available |
| :--- | :--- | :--- |
| **American English (Female)** | `af` | `af_alloy`, `af_aoede`, `af_bella`, `af_heart`, `af_jessica`, `af_kore`, `af_nicole`, `af_nova`, `af_river`, `af_sarah`, `af_sky` |
| **American English (Male)** | `am` | `am_adam`, `am_echo`, `am_eric`, `am_fenrir`, `am_liam`, `am_michael`, `am_onyx`, `am_puck`, `am_santa` |
| **British English (Female)** | `bf` | `bf_alice`, `bf_emma`, `bf_isabella`, `bf_lily` |
| **British English (Male)** | `bm` | `bm_daniel`, `bm_fable`, `bm_george`, `bm_lewis` |
| **Spanish (Female / Male)** | `ef`, `em` | `ef_dora`, `em_alex`, `em_santa` |
| **French (Female)** | `ff` | `ff_siwis` |
| **Hindi (Female / Male)** | `hf`, `hm` | `hf_alpha`, `hf_beta`, `hm_omega`, `hm_psi` |
| **Italian (Female / Male)** | `if`, `im` | `if_sara`, `im_nicola` |
| **Japanese (Female / Male)** | `jf`, `jm` | `jf_alpha`, `jf_gongitsune`, `jf_nezumi`, `jf_tebukuro`, `jm_kumo` |
| **Portuguese (Female / Male)** | `pf`, `pm` | `pf_dora`, `pm_alex`, `pm_santa` |
| **Mandarin Chinese** | `zf`, `zm` | `zf_xiaobei`, `zf_xiaoni`, `zf_xiaoxiao`, `zf_xiaoyi`, `zm_yunjian`, `zm_yunxi`, `zm_yunxia`, `zm_yunyang` |

---

### 4. Inference Parameter Options

| Parameter | Type | Accepted Range | Default | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **`speed`** | `float32` | `0.5` to `2.0` | `1.0` | Controls playback speed without pitch distortion. |
| **`sample_rate`** | `int` | Fixed `24000` | `24000` Hz | Kokoro produces 24 kHz mono float32 audio. |
| **`voice`** | `string` | Any of 59 keys | `tone_warm` | Name of the voice or tone preset from `voices_mobile.bin`. |
| **`lang`** | `string` | `en-us`, `en-gb`, `es`, `fr-fr`, etc. | Auto | Language phonetic code for text tokenizer. |

---

### 5. Mobile Acceleration Options

When initializing ONNX Runtime on mobile devices, select the appropriate execution provider:

* **CPU Execution Provider (Default, Recommended)**:
  * Android: `CPUExecutionProvider` with 4 threads. High performance, zero compatibility issues across Snapdragon, Exynos, MediaTek, and Tensor chips.
  * iOS: `CPUExecutionProvider` with Apple Silicon NEON acceleration.
* **Hardware Accelerators**:
  * Android: `NNAPIExecutionProvider` (Available on Android 9+).
  * iOS: `CoreMLExecutionProvider` (Available on iOS 13+).

---

## Embedded Metadata Reference

Every `.onnx` binary in this bundle includes the following key-value pairs in its ONNX header:

```json
{
  "model_name": "Kokoro-82M",
  "version": "1.0",
  "sample_rate": "24000",
  "description": "Kokoro-82M TTS model with embedded tone presets, category names, language mappings, and phoneme vocab.",
  "tone_presets": "{ \"warm\": {...}, \"welcoming\": {...}, \"story\": {...}, \"calm\": {...}, \"energetic\": {...} }",
  "category_names": "{ \"af\": \"American English (Female)\", ... }",
  "voice_lang_map": "{ \"af\": \"en-us\", \"bm\": \"en-gb\", ... }",
  "available_voices": "[\"af_alloy\", ..., \"tone_warm\", \"tone_welcoming\", ...]",
  "tokenizer_vocab": "{ \";\": 1, \":\": 2, \",\": 3, \".\": 4, ... }"
}
```

---

## Mobile Integration Step-by-Step

### Android (Kotlin) Implementation

#### Step 1: Add Dependency to `app/build.gradle`
```groovy
dependencies {
    implementation 'com.microsoft.onnxruntime:onnxruntime-android:1.18.0'
}
```

#### Step 2: Copy Assets
Place `kokoro_mobile_int8.onnx` and `voices_mobile.bin` in your Android project's `app/src/main/assets/` directory.

#### Step 3: Load Model & Read Embedded Metadata
```kotlin
import ai.onnxruntime.*
import android.content.Context
import org.json.JSONObject
import java.nio.FloatBuffer
import java.nio.LongBuffer

class KokoroTTS(private val context: Context) {
    private val env: OrtEnvironment = OrtEnvironment.getEnvironment()
    private val session: OrtSession

    val sampleRate: Int
    val tonePresets: JSONObject
    val availableVoices: List<String>

    init {
        // Load model from assets
        val modelBytes = context.assets.open("kokoro_mobile_int8.onnx").readBytes()
        val sessionOptions = OrtSession.SessionOptions().apply {
            setIntraOpNumThreads(4)
        }
        session = env.createSession(modelBytes, sessionOptions)

        // Read embedded metadata properties directly from the ONNX binary
        val customMeta = session.metadata.customMetadata
        sampleRate = customMeta["sample_rate"]?.toInt() ?: 24000
        tonePresets = JSONObject(customMeta["tone_presets"] ?: "{}")
        
        println("Loaded Kokoro-82M: Sample Rate = $sampleRate Hz")
    }

    // Step 4: Run Inference
    fun synthesize(tokenIds: LongArray, styleVector: FloatArray, speed: Float = 1.0f): FloatArray {
        val tokenTensor = OnnxTensor.createTensor(
            env, 
            LongBuffer.wrap(tokenIds), 
            longArrayOf(1, tokenIds.size.toLong())
        )
        val styleTensor = OnnxTensor.createTensor(
            env, 
            FloatBuffer.wrap(styleVector), 
            longArrayOf(1, 256)
        )
        val speedTensor = OnnxTensor.createTensor(
            env, 
            FloatBuffer.wrap(floatArrayOf(speed)), 
            longArrayOf(1)
        )

        val inputs = mapOf(
            "tokens" to tokenTensor,
            "style" to styleTensor,
            "speed" to speedTensor
        )

        val results = session.run(inputs)
        val outputTensor = results[0].value as Array<*>
        
        // Output is raw PCM audio samples at 24000 Hz
        return outputTensor as FloatArray
    }
}
```

---

### iOS (Swift) Implementation

#### Step 1: Add ONNX Runtime Pod
In your `Podfile`:
```ruby
pod 'onnxruntime-objc'
```

#### Step 2: Read Metadata and Run Session in Swift
```swift
import Foundation
import onnxruntime_objc

class KokoroTTS {
    private var env: ORTEnv
    private var session: ORTSession

    init?() {
        do {
            self.env = try ORTEnv(loggingLevel: .warning)
            guard let modelPath = Bundle.main.path(forResource: "kokoro_mobile_int8", ofType: "onnx") else {
                return nil
            }
            let options = try ORTSessionOptions()
            try options.setIntraOpNumThreads(4)
            self.session = try ORTSession(env: self.env, modelPath: modelPath, options: options)

            // Read metadata embedded in the ONNX file
            let meta = try self.session.metadata()
            if let presetsStr = meta.customMetadata["tone_presets"] {
                print("Tone presets available: \(presetsStr)")
            }
        } catch {
            print("Failed to initialize Kokoro: \(error)")
            return nil
        }
    }
}
```

---

### Flutter (Dart) Implementation

1. Place `kokoro_mobile_int8.onnx` and `voices_mobile.bin` in `assets/kokoro/` and declare them in `pubspec.yaml`:
   ```yaml
   flutter:
     assets:
       - assets/kokoro/kokoro_mobile_int8.onnx
       - assets/kokoro/voices_mobile.bin
   ```
2. Use the `onnxruntime` Flutter plugin to load the model asset and invoke inference.

---

## ONNX Tensor Contract (Inputs & Outputs)

For low-level integrations (C++, Rust, or custom mobile JNI bridges), here is the exact graph specification:

### Model Inputs

| Tensor Name | Shape | Data Type | Description |
| :--- | :--- | :--- | :--- |
| **`tokens`** | `[1, sequence_length]` | `INT64` | Array of phoneme IDs (from `tokenizer_vocab`). Starts with token `0` and ends with token `0`. |
| **`style`** | `[1, 256]` | `FLOAT32` | 256-dimensional style embedding corresponding to the chosen voice or tone preset from `voices_mobile.bin`. |
| **`speed`** | `[1]` | `FLOAT32` | Playback speed multiplier (e.g. `1.0f` or `0.95f`). |

### Model Outputs

| Tensor Name | Shape | Data Type | Description |
| :--- | :--- | :--- | :--- |
| **`audio`** | `[audio_length]` | `FLOAT32` | 1D array of mono PCM audio samples at **24,000 Hz**. |
