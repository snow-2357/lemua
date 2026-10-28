#!/usr/bin/env python3
"""
Kokoro-82M Mobile Bundle Exporter
Embeds TONE_PRESETS, CATEGORY_NAMES, VOICE_LANG_MAP, and TOKENIZER_VOCAB directly
into the ONNX model binary (metadata_props) and generates a self-contained mobile package.
"""

import os
import sys
import json
import time
from pathlib import Path
import numpy as np
import onnx
import onnxruntime as rt
from kokoro_onnx import Kokoro

# Import configurations and resolver from tts.py
from tts import TONE_PRESETS, CATEGORY_NAMES, VOICE_LANG_MAP, resolve_voice, ensure_model_files


def embed_metadata_in_onnx(source_model_path: Path, dest_model_path: Path, metadata_dict: dict):
    """
    Loads an ONNX model file, embeds key-value metadata properties,
    and saves the resulting ONNX binary.
    """
    print(f"Loading ONNX model from: {source_model_path.name}...")
    model = onnx.load(str(source_model_path))

    # Remove any existing keys that match to prevent duplicate entries
    existing_keys = {prop.key for prop in model.metadata_props}
    for key, value in metadata_dict.items():
        if key in existing_keys:
            # Update existing entry
            for prop in model.metadata_props:
                if prop.key == key:
                    prop.value = value
                    break
        else:
            # Add new entry
            entry = model.metadata_props.add()
            entry.key = key
            entry.value = value

    print(f"Saving metadata-embedded ONNX model to: {dest_model_path}...")
    dest_model_path.parent.mkdir(parents=True, exist_ok=True)
    onnx.save(model, str(dest_model_path))
    size_mb = dest_model_path.stat().st_size / (1024 * 1024)
    print(f"  Saved {dest_model_path.name} ({size_mb:.1f} MB) with {len(model.metadata_props)} metadata properties.")


def create_mobile_voices_pack(source_voices_path: Path, dest_voices_path: Path, kokoro_instance: Kokoro) -> list[str]:
    """
    Creates an enhanced voices binary that contains all original 54 voices
    PLUS pre-blended voice style vectors for each of the TONE_PRESETS.
    Mobile apps can directly look up 'tone_warm', 'tone_welcoming', etc. without runtime blending.
    """
    print("Building enhanced mobile voices pack...")
    raw_data = np.load(str(source_voices_path))
    voices_dict = {key: raw_data[key] for key in raw_data.files}

    # Bake each tone preset into the voice dictionary
    for tone_name, preset in TONE_PRESETS.items():
        voice_key = f"tone_{tone_name}"
        voice_spec = preset["voice"]
        style_vec, _ = resolve_voice(kokoro_instance, voice_spec)
        # Ensure style_vec is a numpy array
        if isinstance(style_vec, str):
            style_vec = kokoro_instance.get_voice_style(style_vec)
        voices_dict[voice_key] = style_vec.astype(np.float32)
        print(f"  Added pre-baked tone preset: '{voice_key}' (from '{voice_spec}')")

    dest_voices_path.parent.mkdir(parents=True, exist_ok=True)
    with open(dest_voices_path, "wb") as f:
        np.savez_compressed(f, **voices_dict)

    size_mb = dest_voices_path.stat().st_size / (1024 * 1024)
    all_voice_keys = sorted(list(voices_dict.keys()))
    print(f"  Saved {dest_voices_path.name} ({size_mb:.1f} MB) with {len(all_voice_keys)} total voices.")
    return all_voice_keys


def verify_mobile_bundle(model_path: Path, voices_path: Path):
    """
    Validates that the generated ONNX model and voices file can be loaded,
    verifies metadata extraction, and executes a test synthesis with a preset voice.
    """
    print(f"\n--- Verifying Mobile Bundle with ONNX Runtime ---")
    session = rt.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
    custom_meta = session.get_modelmeta().custom_metadata_map

    print("Verifying embedded ONNX metadata:")
    for k, v in custom_meta.items():
        val_preview = v if len(v) < 60 else v[:60] + "..."
        print(f"  [OK] {k} ({len(v)} chars) -> {val_preview}")

    # Verify speech synthesis using kokoro-onnx with the mobile bundle
    print("\nTesting speech synthesis with kokoro-onnx and 'tone_warm'...")
    k = Kokoro(str(model_path), str(voices_path))
    samples, sample_rate = k.create("Kokoro mobile bundle verified successfully.", voice="tone_warm", speed=1.0)
    duration_s = len(samples) / sample_rate
    print(f"  [OK] Audio synthesized: {len(samples)} samples ({duration_s:.2f}s at {sample_rate}Hz)")


def main():
    workspace_dir = Path(__file__).resolve().parent
    mobile_dir = workspace_dir / "mobile_bundle"
    mobile_dir.mkdir(parents=True, exist_ok=True)

    print("=== Kokoro-82M Mobile Bundle Generator ===")
    
    # 1. Ensure source base models exist
    fp32_model_path, source_voices_path = ensure_model_files(workspace_dir)
    int8_model_path = workspace_dir / "kokoro-v1.0.int8.onnx"
    
    # Initialize Kokoro to access vocab and voice resolver
    print("\nInitializing Kokoro for voice embedding and metadata extraction...")
    k = Kokoro(str(fp32_model_path), str(source_voices_path))
    vocab = k.tokenizer.vocab

    # 2. Build the enhanced mobile voices pack
    dest_voices_path = mobile_dir / "voices_mobile.bin"
    all_voices = create_mobile_voices_pack(source_voices_path, dest_voices_path, k)

    # 3. Construct comprehensive metadata dictionary
    metadata_dict = {
        "model_name": "Kokoro-82M",
        "version": "1.0",
        "sample_rate": "24000",
        "description": "Kokoro-82M TTS model with embedded tone presets, category names, language mappings, and phoneme vocab.",
        "tone_presets": json.dumps(TONE_PRESETS, ensure_ascii=False),
        "category_names": json.dumps(CATEGORY_NAMES, ensure_ascii=False),
        "voice_lang_map": json.dumps(VOICE_LANG_MAP, ensure_ascii=False),
        "available_voices": json.dumps(all_voices, ensure_ascii=False),
        "tokenizer_vocab": json.dumps(vocab, ensure_ascii=False),
    }

    # 4. Save metadata JSON file for apps that prefer loading JSON directly
    meta_json_path = mobile_dir / "kokoro_metadata.json"
    with open(meta_json_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "model_name": "Kokoro-82M",
                "version": "1.0",
                "sample_rate": 24000,
                "description": metadata_dict["description"],
                "tone_presets": TONE_PRESETS,
                "category_names": CATEGORY_NAMES,
                "voice_lang_map": VOICE_LANG_MAP,
                "available_voices": all_voices,
                "tokenizer_vocab": vocab,
            },
            f,
            indent=2,
            ensure_ascii=False,
        )
    print(f"\nSaved standalone metadata JSON to: {meta_json_path} ({meta_json_path.stat().st_size / 1024:.1f} KB)")

    # 5. Embed metadata into the INT8 mobile model (recommended for mobile)
    dest_int8_model = mobile_dir / "kokoro_mobile_int8.onnx"
    if int8_model_path.exists():
        embed_metadata_in_onnx(int8_model_path, dest_int8_model, metadata_dict)
    else:
        print(f"Warning: {int8_model_path} not found. Skipping INT8 embedding.")

    # 6. Embed metadata into the FP32 model
    dest_fp32_model = mobile_dir / "kokoro_mobile.onnx"
    embed_metadata_in_onnx(fp32_model_path, dest_fp32_model, metadata_dict)

    # 7. Verify generated bundle
    verify_mobile_bundle(dest_int8_model if dest_int8_model.exists() else dest_fp32_model, dest_voices_path)

    print("\n=== Mobile Bundle Generation Completed! ===")
    print(f"Artifacts ready in: {mobile_dir}")
    for item in mobile_dir.iterdir():
        sz = item.stat().st_size / (1024 * 1024)
        print(f"  - {item.name:<25} ({sz:6.2f} MB)")


if __name__ == "__main__":
    main()
