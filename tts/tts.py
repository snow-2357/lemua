#!/usr/bin/env python3
"""
Kokoro-82M Text-to-Speech (TTS) Converter
Converts text from an input file (e.g. input.txt) into speech audio (WAV).
Powered by Kokoro-82M ONNX Runtime for ultra-fast, high-quality generation.
"""

import os
import sys
import time
import argparse
import urllib.request
from pathlib import Path
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

# Base URLs for downloading model files if missing
MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
VOICES_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"

# Mapping from voice prefix to default language code
VOICE_LANG_MAP = {
    "af": "en-us",  # American Female
    "am": "en-us",  # American Male
    "bf": "en-gb",  # British Female
    "bm": "en-gb",  # British Male
    "ef": "es",     # Spanish Female
    "em": "es",     # Spanish Male
    "ff": "fr-fr",  # French Female
    "hf": "hi",     # Hindi Female
    "hm": "hi",     # Hindi Male
    "if": "it",     # Italian Female
    "im": "it",     # Italian Male
    "jf": "ja",     # Japanese Female
    "jm": "ja",     # Japanese Male
    "pf": "pt-br",  # Portuguese Female
    "pm": "pt-br",  # Portuguese Male
    "zf": "zh",     # Mandarin Chinese Female
    "zm": "zh",     # Mandarin Chinese Male
}

CATEGORY_NAMES = {
    "af": "American English (Female)",
    "am": "American English (Male)",
    "bf": "British English (Female)",
    "bm": "British English (Male)",
    "ef": "Spanish (Female)",
    "em": "Spanish (Male)",
    "ff": "French (Female)",
    "hf": "Hindi (Female)",
    "hm": "Hindi (Male)",
    "if": "Italian (Female)",
    "im": "Italian (Male)",
    "jf": "Japanese (Female)",
    "jm": "Japanese (Male)",
    "pf": "Portuguese (Female)",
    "pm": "Portuguese (Male)",
    "zf": "Mandarin Chinese (Female)",
    "zm": "Mandarin Chinese (Male)",
}


def download_with_progress(url: str, dest_path: Path):
    """Download a file with a command-line progress indicator."""
    print(f"Downloading {dest_path.name} from {url}...")
    start_time = time.time()

    def reporthook(block_num, block_size, total_size):
        downloaded = block_num * block_size
        if total_size > 0:
            percent = min(100.0, downloaded * 100.0 / total_size)
            mb_downloaded = downloaded / (1024 * 1024)
            mb_total = total_size / (1024 * 1024)
            elapsed = time.time() - start_time
            speed = mb_downloaded / elapsed if elapsed > 0 else 0
            sys.stdout.write(
                f"\r  [{percent:5.1f}%] {mb_downloaded:6.1f} MB / {mb_total:6.1f} MB ({speed:4.1f} MB/s)"
            )
            sys.stdout.flush()

    urllib.request.urlretrieve(url, str(dest_path), reporthook=reporthook)
    sys.stdout.write("\n")
    print(f"  Finished downloading {dest_path.name} in {time.time() - start_time:.1f}s.")


def ensure_model_files(script_dir: Path) -> tuple[Path, Path]:
    """Ensure the ONNX model and voice pack files exist, downloading them if necessary."""
    model_path = script_dir / "kokoro-v1.0.onnx"
    voices_path = script_dir / "voices-v1.0.bin"

    if not model_path.exists():
        download_with_progress(MODEL_URL, model_path)

    if not voices_path.exists():
        download_with_progress(VOICES_URL, voices_path)

    return model_path, voices_path


def read_text_file(file_path: Path) -> str:
    """Read content of text file with fallback encoding handling."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            text = f.read()
    except UnicodeDecodeError:
        with open(file_path, "r", encoding="latin-1") as f:
            text = f.read()
    return text.strip()


def list_voices(kokoro: Kokoro):
    """Print all available voices and tone presets."""
    print("\n=== Available Tone Presets ===")
    for name, info in TONE_PRESETS.items():
        print(f"  --tone {name:<10} : {info['description']}")
        print(f"                     (blend: {info['voice']}, speed: {info['speed']}x)")

    voices = kokoro.get_voices()
    grouped = {}
    for v in voices:
        prefix = v[:2]
        grouped.setdefault(prefix, []).append(v)

    print("\n=== Available Kokoro-82M Voices ===")
    for prefix, voice_list in grouped.items():
        cat = CATEGORY_NAMES.get(prefix, prefix)
        print(f"\n[{cat}] ({len(voice_list)} voices):")
        print("  " + ", ".join(voice_list))
    print("\nDefault voice: 'af_heart' (Flagship natural female voice)")
    print("Voice blending is also supported directly: e.g. -v 'af_heart:70,af_bella:30'")


def get_default_lang_for_voice(voice_name: str) -> str:
    """Infer the appropriate language code from the voice name prefix."""
    prefix = voice_name[:2]
    return VOICE_LANG_MAP.get(prefix, "en-us")


TONE_PRESETS = {
    "warm": {
        "description": "Warm, natural, and friendly female voice blend (af_heart + af_bella)",
        "voice": "af_heart:65,af_bella:35",
        "speed": 0.95,
    },
    "welcoming": {
        "description": "Welcoming, soothing, and gentle tone (af_heart + af_sarah)",
        "voice": "af_heart:70,af_sarah:30",
        "speed": 0.95,
    },
    "story": {
        "description": "Warm British narrative storytelling tone (bm_fable)",
        "voice": "bm_fable",
        "speed": 0.95,
    },
    "calm": {
        "description": "Relaxed, peaceful, and soothing tone (af_heart at 0.90x)",
        "voice": "af_heart",
        "speed": 0.90,
    },
    "energetic": {
        "description": "Upbeat, lively, and vibrant tone (af_bella + af_nova)",
        "voice": "af_bella:60,af_nova:40",
        "speed": 1.05,
    },
}


def resolve_voice(kokoro: Kokoro, voice_spec: str):
    """
    Resolves a voice string into either a single voice or a blended numpy style embedding.
    Supports:
      - Single voice: 'af_heart'
      - Weighted blend: 'af_heart:70,af_bella:30' or 'af_heart:0.7,af_bella:0.3'
      - Equal blend: 'af_heart,af_bella'
    """
    if "," not in voice_spec and ":" not in voice_spec:
        v_name = voice_spec.strip()
        if v_name not in kokoro.get_voices():
            raise ValueError(f"Voice '{v_name}' not found in available voices.")
        return v_name, v_name[:2]

    parts = [p.strip() for p in voice_spec.split(",") if p.strip()]
    styles = []
    weights = []
    first_prefix = None

    for part in parts:
        if ":" in part:
            v_name, weight_str = part.split(":", 1)
            v_name = v_name.strip()
            w = float(weight_str.strip())
        else:
            v_name = part.strip()
            w = 1.0

        if v_name not in kokoro.get_voices():
            raise ValueError(f"Voice '{v_name}' not found in available voices.")

        if first_prefix is None:
            first_prefix = v_name[:2]

        styles.append(kokoro.get_voice_style(v_name))
        weights.append(w)

    total_w = sum(weights)
    if total_w == 0:
        total_w = 1.0
    normalized_weights = [w / total_w for w in weights]

    blended_style = np.zeros_like(styles[0])
    for s, nw in zip(styles, normalized_weights):
        blended_style += nw * s

    return blended_style, first_prefix


def main():
    parser = argparse.ArgumentParser(
        description="Convert a text file to high-quality audio using Kokoro-82M."
    )
    parser.add_argument(
        "-i", "--input",
        type=str,
        default="input.txt",
        help="Path to the input text file (default: input.txt)"
    )
    parser.add_argument(
        "-o", "--output",
        type=str,
        default="output.wav",
        help="Path for the output audio file (default: output.wav)"
    )
    parser.add_argument(
        "-t", "--tone",
        type=str,
        default=None,
        choices=list(TONE_PRESETS.keys()),
        help=f"Preset tone: {', '.join(TONE_PRESETS.keys())} (e.g. --tone warm or --tone welcoming)"
    )
    parser.add_argument(
        "-v", "--voice",
        type=str,
        default=None,
        help="Voice or blend (e.g. 'af_heart' or 'af_heart:70,af_bella:30'). Run --list-voices to view all."
    )
    parser.add_argument(
        "-s", "--speed",
        type=float,
        default=None,
        help="Speech speed multiplier between 0.5 and 2.0 (default: 1.0, or preset default)"
    )
    parser.add_argument(
        "-l", "--lang",
        type=str,
        default=None,
        help="Language code (e.g. en-us, en-gb, es, fr-fr, hi, it, ja, pt-br, zh). Auto-detected if not specified."
    )
    parser.add_argument(
        "--list-voices",
        action="store_true",
        help="Display all available voices and tone presets, then exit"


    )

    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    model_path, voices_path = ensure_model_files(script_dir)

    print("Initializing Kokoro-82M ONNX model...")
    t0 = time.time()
    kokoro = Kokoro(str(model_path), str(voices_path))
    init_time = time.time() - t0
    print(f"Kokoro-82M ready in {init_time:.2f}s.")

    if args.list_voices:
        list_voices(kokoro)
        return

    # Check input file
    input_file = Path(args.input)
    if not input_file.is_absolute():
        input_file = (script_dir / input_file).resolve()

    if not input_file.exists():
        print(f"Error: Input file not found: {input_file}")
        print("Please create an input.txt file or specify a valid file with -i <path>")
        sys.exit(1)

    text = read_text_file(input_file)
    if not text:
        print(f"Error: Input file '{input_file}' is empty.")
        sys.exit(1)

    # Determine voice and speed from tone preset or direct arguments
    tone_info = TONE_PRESETS.get(args.tone) if args.tone else None

    if args.voice:
        raw_voice = args.voice
    elif tone_info:
        raw_voice = tone_info["voice"]
    else:
        raw_voice = "af_heart"

    if args.speed is not None:
        speed = args.speed
    elif tone_info:
        speed = tone_info["speed"]
    else:
        speed = 1.0

    # Resolve voice (supports single voice or blends like 'af_heart:70,af_bella:30')
    try:
        voice_obj, voice_prefix = resolve_voice(kokoro, raw_voice)
    except Exception as e:
        print(f"Error configuring voice: {e}")
        sys.exit(1)

    # Determine language
    lang = args.lang or VOICE_LANG_MAP.get(voice_prefix, "en-us")

    # Validate speed
    if not (0.5 <= speed <= 2.0):
        print(f"Error: Speed must be between 0.5 and 2.0 (got {speed})")
        sys.exit(1)

    output_file = Path(args.output)
    if not output_file.is_absolute():
        output_file = (script_dir / output_file).resolve()

    tone_str = f" [{args.tone}]" if args.tone else ""
    print(f"\n--- Kokoro-82M Synthesis ---")
    print(f"Input file : {input_file}")
    print(f"Text length: {len(text)} characters ({len(text.split())} words)")
    print(f"Voice/Tone : {raw_voice}{tone_str}")
    print(f"Language   : {lang}")
    print(f"Speed      : {speed}x")
    print(f"Generating audio...")

    gen_start = time.time()
    samples, sample_rate = kokoro.create(
        text=text,
        voice=voice_obj,
        speed=speed,
        lang=lang
    )
    gen_time = time.time() - gen_start

    # Save audio file
    sf.write(str(output_file), samples, sample_rate)
    duration_sec = len(samples) / sample_rate
    file_size_kb = output_file.stat().st_size / 1024
    rtf = gen_time / duration_sec if duration_sec > 0 else 0

    print(f"\nGeneration completed successfully!")
    print(f"Saved to   : {output_file}")
    print(f"Audio stats: {duration_sec:.2f} seconds | {sample_rate} Hz | {file_size_kb:.1f} KB")
    print(f"Performance: Synthesized in {gen_time:.2f}s (RTF: {rtf:.3f}x real-time)")


if __name__ == "__main__":
    main()
