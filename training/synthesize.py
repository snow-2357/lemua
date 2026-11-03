import argparse
import math
from pathlib import Path

import torch
import torchaudio
from torchaudio.prototype.pipelines import HIFIGAN_VOCODER_V3_LJSPEECH

from frontend import phoneme_token_ids
from model import TTSStudentModel

TRAINING_DIR = Path(__file__).resolve().parent
CHECKPOINT_PATH = TRAINING_DIR / "tts_student_model.pth"


def load_student(device):
    checkpoint = torch.load(CHECKPOINT_PATH, map_location=device, weights_only=True)
    if (
        not isinstance(checkpoint, dict)
        or checkpoint.get("format_version") != 4
        or checkpoint.get("input_encoding") != "espeak_ipa_codepoint"
    ):
        raise RuntimeError(
            "This checkpoint was not trained with the eSpeak phoneme frontend. "
            "Run `python train.py --restart` to train the phoneme-to-mel student."
        )

    model = TTSStudentModel(
        vocab_size=checkpoint["vocab_size"],
        hidden_dim=checkpoint["hidden_dim"],
        max_frames=checkpoint["max_frames"],
    ).to(device)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    return model


def synthesize(text, output_path):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = load_student(device)
    tokens = torch.tensor(
        [phoneme_token_ids(text, model.vocab_size)], dtype=torch.long, device=device
    )

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

    torchaudio.save(output_path, waveform.squeeze(0).cpu(), int(bundle.sample_rate))
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
    args = parser.parse_args()
    synthesize(args.text, args.output)


if __name__ == "__main__":
    main()
