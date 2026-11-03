import argparse
import math
from pathlib import Path

import torch
import torchaudio
import soundfile as sf
from torchaudio.prototype.pipelines import HIFIGAN_VOCODER_V3_LJSPEECH

from model import TTSStudentModel


TRAINING_DIR = Path(__file__).resolve().parent
CHECKPOINT_PATH = TRAINING_DIR / "tts_student_model.pth"
KOKORO_DIR = TRAINING_DIR.parent / "tts"


def load_student(device):
    checkpoint = torch.load(CHECKPOINT_PATH, map_location=device, weights_only=True)
    if not isinstance(checkpoint, dict) or checkpoint.get("format_version") != 2:
        raise RuntimeError(
            "This is an older duration-only checkpoint and cannot generate speech. "
            "Retrain the acoustic student with `python train.py` first."
        )

    model = TTSStudentModel(
        vocab_size=checkpoint["vocab_size"],
        hidden_dim=checkpoint["hidden_dim"],
        max_frames=checkpoint["max_frames"],
    ).to(device)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    return model


def phoneme_tokens(text):
    from kokoro import KPipeline

    pipeline = KPipeline(lang_code="a", model=False)
    phonemes = "".join(
        result.phonemes or "" for result in pipeline(text, split_pattern=None)
    )
    if not phonemes:
        raise ValueError("Kokoro did not produce phonemes for the supplied text.")

    token_ids = [ord(character) for character in phonemes]
    if max(token_ids) >= 10000:
        raise ValueError("Kokoro produced a phoneme outside the trained vocabulary.")
    return torch.tensor([token_ids], dtype=torch.long)


def synthesize(text, output_path):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = load_student(device)
    tokens = phoneme_tokens(text).to(device)

    with torch.inference_mode():
        _, predicted_log_length = model(tokens, max_frames=1)
        min_log_length = math.log1p(32)
        max_log_length = math.log1p(model.max_frames)
        predicted_log_length = predicted_log_length.clamp(
            min=min_log_length, max=max_log_length
        )
        frame_count = int(torch.expm1(predicted_log_length).round().item())

        predicted_mels, _ = model(tokens, max_frames=frame_count)
        mel = predicted_mels.transpose(1, 2).clamp(min=-11.5129, max=1.0)

        bundle = HIFIGAN_VOCODER_V3_LJSPEECH
        vocoder = bundle.get_vocoder().to(device).eval()
        waveform = vocoder(mel)

    torchaudio.save(
        output_path, waveform.squeeze(0).cpu(), int(bundle.sample_rate)
    )
    print(f"Saved synthesized audio to {output_path}")
    print(f"Sample rate: {bundle.sample_rate} Hz")


def synthesize_with_kokoro(text, output_path, voice):
    try:
        from kokoro_onnx import Kokoro
    except ImportError as exc:
        raise RuntimeError(
            "The Kokoro ONNX runtime is not installed. From the repository root, "
            "run `python -m pip install -r tts\\requirements.txt`."
        ) from exc

    model_path = KOKORO_DIR / "kokoro-v1.0.onnx"
    voices_path = KOKORO_DIR / "voices-v1.0.bin"
    for path in (model_path, voices_path):
        if not path.is_file():
            raise FileNotFoundError(f"Required Kokoro model file not found: {path}")

    kokoro = Kokoro(str(model_path), str(voices_path))
    audio, sample_rate = kokoro.create(
        text=text, voice=voice, speed=1.0, lang="en-us"
    )
    sf.write(output_path, audio, sample_rate)
    print(f"Saved Kokoro speech to {output_path}")
    print(f"Sample rate: {sample_rate} Hz")


def main():
    parser = argparse.ArgumentParser(description="Synthesize speech using Kokoro.")
    parser.add_argument("text", nargs="?", default="Hello world, testing the student model.")
    parser.add_argument(
        "--backend",
        choices=("kokoro", "student"),
        default="kokoro",
        help=(
            "Use the pretrained Kokoro model for clear speech, or the experimental "
            "student checkpoint."
        ),
    )
    parser.add_argument("--voice", default="af_heart", help="Kokoro voice name.")
    parser.add_argument(
        "--output",
        default=str(TRAINING_DIR / "output_synthesized.wav"),
        help="Path for the generated WAV file.",
    )
    args = parser.parse_args()
    if args.backend == "kokoro":
        synthesize_with_kokoro(args.text, args.output, args.voice)
    else:
        synthesize(args.text, args.output)


if __name__ == "__main__":
    main()
