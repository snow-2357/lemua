import argparse
from pathlib import Path
import numpy as np
import onnxruntime as ort
import soundfile as sf


# Self-contained tokenization function (replaces the need to import from 'frontend')
def phoneme_token_ids(text: str, vocab_size: int = 10000) -> list:
    """Converts text characters into bounded token IDs."""
    return [ord(c) % vocab_size for c in text]


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL = BASE_DIR / "lumua.onnx"
DEFAULT_OUTPUT = BASE_DIR / "outputs" / "batch_output.wav"
SAMPLE_RATE = 22050
VOCAB_SIZE = 10000


def main():
    parser = argparse.ArgumentParser(
        description="Convert a text file (.txt) into an audio file using the ONNX TTS model."
    )
    parser.add_argument("input_file", type=str, help="Path to the input .txt file")
    parser.add_argument(
        "--model", default=str(DEFAULT_MODEL), help="Path to lumua.onnx model"
    )
    parser.add_argument(
        "--output", default=str(DEFAULT_OUTPUT), help="Path to save output .wav audio"
    )
    parser.add_argument(
        "--speed", type=float, default=1.0, help="Speech speed multiplier"
    )
    args = parser.parse_args()

    input_path = Path(args.input_file)
    if not input_path.exists():
        raise FileNotFoundError(f"Input text file not found: {input_path}")

    # Read and clean text lines
    lines = [
        line.strip()
        for line in input_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    if not lines:
        print("The input text file is empty.")
        return

    print(f"Loaded {len(lines)} valid line(s) from {input_path.name}")
    print(f"Loading ONNX model from {args.model}...")

    session = ort.InferenceSession(args.model, providers=["CPUExecutionProvider"])

    # Combine text and generate tokens
    full_text = " ".join(lines)
    print(f"Synthesizing text ({len(full_text)} characters)...")

    token_ids = phoneme_token_ids(full_text, VOCAB_SIZE)
    tokens = np.array([token_ids], dtype=np.int64)
    speed_arr = np.array([args.speed], dtype=np.float32)

    # Run ONNX inference
    waveform = session.run(None, {"tokens": tokens, "speed": speed_arr})[0]

    if not np.isfinite(waveform).all():
        print("WARNING: the output contains NaN or infinite values.")

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output_path, waveform.astype(np.float32), SAMPLE_RATE)

    duration = len(waveform) / SAMPLE_RATE
    print(f"Successfully saved combined audio ({duration:.2f}s) to: {output_path}")


if __name__ == "__main__":
    main()
