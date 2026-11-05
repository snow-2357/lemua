import argparse
import time
from pathlib import Path
import sys
import os

import numpy as np
import onnxruntime as ort
import soundfile as sf

PAD_ID = 0
BOS_ID = 1
EOS_ID = 2

_ESPEAK_DLL_DIRECTORY = None


def _configure_espeak(espeakng_loader):
    global _ESPEAK_DLL_DIRECTORY

    library_path = espeakng_loader.get_library_path()
    data_path = espeakng_loader.get_data_path()
    os.environ["PHONEMIZER_ESPEAK_LIBRARY"] = library_path
    os.environ["PHONEMIZER_ESPEAK_DATA_PATH"] = data_path

    if sys.platform == "win32" and _ESPEAK_DLL_DIRECTORY is None:
        _ESPEAK_DLL_DIRECTORY = os.add_dll_directory(str(Path(library_path).parent))


def text_to_phonemes(text: str) -> str:
    """Raw eSpeak (en-us) IPA string. This is exactly what the student sees."""
    try:
        import espeakng_loader
        from phonemizer import phonemize
    except ImportError as exc:
        raise RuntimeError(
            "The text frontend needs phonemizer and espeakng-loader. "
            "Install them with `python -m pip install -r requirements.txt` "
            "from the training directory."
        ) from exc

    _configure_espeak(espeakng_loader)

    phonemes = phonemize(
        text.strip(),
        language="en-us",
        backend="espeak",
        strip=True,
        preserve_punctuation=True,
        with_stress=True,
        language_switch="remove-flags",
    )
    if not isinstance(phonemes, str):
        raise TypeError("The phonemizer returned an unexpected batch result.")
    phonemes = " ".join(phonemes.split())
    if not phonemes:
        raise ValueError(
            "The phonemizer did not produce phonemes for the supplied text."
        )
    return phonemes


def phonemes_to_token_ids(phonemes: str, vocab_size: int = 10000) -> list[int]:
    """[BOS] + one id per phoneme character + [EOS].

    The BOS/EOS slots line up with the two padding tokens Kokoro wraps around
    its own input, so teacher durations map 1:1 onto these tokens.
    """
    token_ids = [ord(character) for character in phonemes]
    if any(token_id <= EOS_ID or token_id >= vocab_size for token_id in token_ids):
        raise ValueError(
            f"Phoneme output contains a character outside the vocabulary "
            f"({EOS_ID}, {vocab_size})."
        )
    return [BOS_ID] + token_ids + [EOS_ID]


def phoneme_token_ids(text: str, vocab_size: int = 10000) -> list[int]:
    return phonemes_to_token_ids(text_to_phonemes(text), vocab_size)


TRAINING_DIR = Path(__file__).resolve().parent.parent
DEFAULT_MODEL = TRAINING_DIR / "checkpoints" / "kokoro-v1.0.onnx"
SAMPLE_RATE = 22050
VOCAB_SIZE = 10000


def main():
    parser = argparse.ArgumentParser(
        description="Run the combined student + vocoder ONNX model on text."
    )
    parser.add_argument(
        "text",
        nargs="?",
        default="As the golden light of late afternoon began to filter through the dense canopy of ancient pine trees, a gentle breeze swept across the valley, carrying the crisp scent of damp earth and blooming wildflowers. High above the winding river, a lone hawk circled lazily against the pale azure sky, scanning the landscape below with sharp, unblinking focus. Technology and nature have long danced in a delicate balance, where every subtle adaptation shapes the future of how we understand our world, turning complex algorithms into seamless expressions of human thought and creativity.",
    )
    parser.add_argument("--model", default=str(DEFAULT_MODEL))
    parser.add_argument("--output", default=str(TRAINING_DIR / "original_output.wav"))
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
