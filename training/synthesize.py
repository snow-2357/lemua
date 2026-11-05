import argparse
from pathlib import Path

import soundfile as sf
import torch
from torchaudio.prototype.pipelines import HIFIGAN_VOCODER_V3_LJSPEECH

from frontend import chunk_token_ids, phoneme_chunks
from model import TTSStudentModel

TRAINING_DIR = Path(__file__).resolve().parent
CHECKPOINT_PATH = TRAINING_DIR / "tts_student_model.pth"


def load_student(device):
    checkpoint = torch.load(CHECKPOINT_PATH, map_location=device, weights_only=True)
    if (
        not isinstance(checkpoint, dict)
        or checkpoint.get("format_version") != 6
        or checkpoint.get("input_encoding") != "kokoro_misaki_codepoint"
    ):
        raise RuntimeError(
            "This checkpoint is from an older model version. Regenerate the data with "
            "gen_teacher_data.py, then run `python train.py --restart`."
        )

    model = TTSStudentModel(
        vocab_size=checkpoint["vocab_size"],
        hidden_dim=checkpoint["hidden_dim"],
        max_frames=checkpoint["max_frames"],
    ).to(device)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    return model


def synthesize(text, output_path, speed=1.0):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = load_student(device)
    chunks = phoneme_chunks(text)
    print(f"Phonemes: {' | '.join(chunks)}")
    tokens = torch.tensor(
        [chunk_token_ids(chunks, model.vocab_size)], dtype=torch.long, device=device
    )

    with torch.inference_mode():
        encoded, log_durations = model.encode(tokens)
        durations = model.predict_durations(tokens, log_durations, speed)
        if int(durations.sum()) > model.max_frames:
            raise ValueError("Text is too long for one pass; split it into sentences.")
        predicted_mels, _ = model.decode(encoded, durations)
        mel = predicted_mels.transpose(1, 2).clamp(min=-11.5129, max=2.0)

        bundle = HIFIGAN_VOCODER_V3_LJSPEECH
        vocoder = bundle.get_vocoder().to(device).eval()
        waveform = vocoder(mel)

    sf.write(
        output_path, waveform.squeeze().cpu().numpy(), int(bundle.sample_rate)
    )
    print(f"Saved synthesized audio to {output_path}")
    print(f"Sample rate: {bundle.sample_rate} Hz")


def main():
    parser = argparse.ArgumentParser(
        description="Synthesize speech using the trained student checkpoint."
    )
    parser.add_argument(
        "text", nargs="?", default="Hello world, testing the student model."
    )
    parser.add_argument(
        "--output",
        default=str(TRAINING_DIR / "output_synthesized.wav"),
        help="Path for the generated WAV file.",
    )
    parser.add_argument(
        "--speed", type=float, default=1.0, help="Speaking rate multiplier."
    )
    args = parser.parse_args()
    if args.speed <= 0:
        parser.error("--speed must be positive.")
    synthesize(args.text, args.output, args.speed)


if __name__ == "__main__":
    main()
