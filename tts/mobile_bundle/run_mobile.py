#!/usr/bin/env python3
"""
Kokoro Mobile Bundle CLI Runner & Test Tool
Tests and verifies the mobile-optimized ONNX model and voices_mobile.bin bundle directly.
"""

import sys
import time
import argparse
from pathlib import Path
import soundfile as sf
import onnxruntime as rt
from kokoro_onnx import Kokoro


def main():
    bundle_dir = Path(__file__).resolve().parent

    parser = argparse.ArgumentParser(
        description="Run and test the Kokoro-82M Mobile Bundle directly."
    )
    parser.add_argument(
        "-i", "--input",
        type=str,
        default="Hello! This audio is running directly on the mobile-optimized INT8 ONNX bundle.",
        help="Text string or path to a .txt file to speak."
    )
    parser.add_argument(
        "-m", "--model",
        type=str,
        default="kokoro_mobile_int8.onnx",
        choices=["kokoro_mobile_int8.onnx", "kokoro_mobile.onnx"],
        help="Mobile model binary to test (default: kokoro_mobile_int8.onnx)"
    )
    parser.add_argument(
        "-v", "--voice",
        type=str,
        default="tone_warm",
        help="Voice or pre-baked tone preset to use (default: tone_warm). e.g. tone_welcoming, tone_story, af_heart"
    )
    parser.add_argument(
        "-s", "--speed",
        type=float,
        default=1.0,
        help="Speech speed multiplier 0.5 to 2.0 (default: 1.0)"
    )
    parser.add_argument(
        "-o", "--output",
        type=str,
        default="mobile_test_output.wav",
        help="Output WAV audio path (default: mobile_test_output.wav)"
    )
    parser.add_argument(
        "--show-metadata",
        action="store_true",
        help="Print the embedded ONNX metadata properties from the model binary and exit."
    )

    args = parser.parse_args()

    model_path = bundle_dir / args.model
    voices_path = bundle_dir / "voices_mobile.bin"

    if not model_path.exists():
        print(f"Error: Model not found at {model_path}")
        sys.exit(1)
    if not voices_path.exists():
        print(f"Error: Voices file not found at {voices_path}")
        sys.exit(1)

    # Inspect metadata if requested
    if args.show_metadata:
        sess = rt.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
        meta = sess.get_modelmeta().custom_metadata_map
        print(f"\n=== Embedded ONNX Metadata for {args.model} ===")
        for k, v in meta.items():
            print(f"\n[{k}]:")
            print(v if len(v) < 300 else v[:300] + f"... ({len(v)} total characters)")
        return

    # Check if input is a text file or raw string
    input_path = Path(args.input)
    if input_path.exists() and input_path.is_file():
        with open(input_path, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read().strip()
    else:
        text = args.input.strip()

    if not text:
        print("Error: Input text is empty.")
        sys.exit(1)

    print(f"Initializing Mobile ONNX Runner...")
    print(f"  Model  : {model_path.name} ({model_path.stat().st_size / (1024*1024):.1f} MB)")
    print(f"  Voices : {voices_path.name}")
    print(f"  Voice  : {args.voice}")
    print(f"  Speed  : {args.speed}x")

    t0 = time.time()
    kokoro = Kokoro(str(model_path), str(voices_path))
    init_time = time.time() - t0
    print(f"Model ready in {init_time:.2f}s.")

    available = kokoro.get_voices()
    if args.voice not in available:
        print(f"Error: Voice '{args.voice}' not found in voices_mobile.bin.")
        print(f"Preset tones available: {[v for v in available if v.startswith('tone_')]}")
        sys.exit(1)

    print(f"\nSynthesizing: \"{text[:80]}{'...' if len(text) > 80 else ''}\"")
    gen_t0 = time.time()
    samples, sample_rate = kokoro.create(text=text, voice=args.voice, speed=args.speed)
    gen_time = time.time() - gen_t0

    output_path = Path(args.output)
    if not output_path.is_absolute():
        output_path = bundle_dir / output_path

    sf.write(str(output_path), samples, sample_rate)
    duration_s = len(samples) / sample_rate
    rtf = gen_time / duration_s if duration_s > 0 else 0

    print(f"\nAudio generated successfully!")
    print(f"  Saved to    : {output_path}")
    print(f"  Duration    : {duration_s:.2f} seconds ({len(samples)} samples at {sample_rate} Hz)")
    print(f"  Inference   : {gen_time:.2f}s (RTF: {rtf:.3f}x real-time)")


if __name__ == "__main__":
    main()
