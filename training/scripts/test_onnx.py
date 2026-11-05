import argparse
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
import soundfile as sf

from frontend import phoneme_token_ids

TRAINING_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL = TRAINING_DIR / "lumua.onnx"
SAMPLE_RATE = 22050
VOCAB_SIZE = 10000


def main():
    parser = argparse.ArgumentParser(
        description="Run the combined student + vocoder ONNX model on text."
    )
    parser.add_argument("text", nargs="?", default="Hello world, this is a test.")
    parser.add_argument("--model", default=str(DEFAULT_MODEL))
    parser.add_argument("--output", default=str(TRAINING_DIR / "onnx_output.wav"))
    parser.add_argument("--speed", type=float, default=1.0)
    args = parser.parse_args()

    session = ort.InferenceSession(args.model, providers=["CPUExecutionProvider"])
    print("Inputs: ", [(i.name, i.shape, i.type) for i in session.get_inputs()])
    print("Outputs:", [(o.name, o.shape, o.type) for o in session.get_outputs()])

    token_ids = phoneme_token_ids(args.text, VOCAB_SIZE)
    tokens = np.array([token_ids], dtype=np.int64)
    speed = np.array([args.speed], dtype=np.float32)
    print(f"Text: {args.text!r} -> {len(token_ids)} tokens")

    # First call includes one-time setup cost, so time the second one too.
    session.run(None, {"tokens": tokens, "speed": speed})
    start = time.perf_counter()
    waveform = session.run(None, {"tokens": tokens, "speed": speed})[0]
    elapsed = time.perf_counter() - start

    seconds = len(waveform) / SAMPLE_RATE
    print(f"Audio: {seconds:.2f} s, peak {np.abs(waveform).max():.3f}")
    print(
        f"Inference: {elapsed:.2f} s ({seconds / elapsed:.1f}x faster than real time)"
    )
    if not np.isfinite(waveform).all():
        print("WARNING: the output contains NaN or infinite values.")

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    sf.write(args.output, waveform.astype(np.float32), SAMPLE_RATE)
    print(f"Saved {args.output}")


if __name__ == "__main__":
    main()
