import argparse
import json
import sys
from pathlib import Path

import soundfile as sf
import torch

TRAINING_DIR = Path(__file__).resolve().parent
CHECKPOINT_PATH = TRAINING_DIR / "tts_student_model.pth"

# Official HiFi-GAN repo (git clone https://github.com/jik876/hifi-gan)
VOCODER_DIR = TRAINING_DIR / "hifi-gan"
VOCODER_CKPT = TRAINING_DIR / "generator_v3"
VOCODER_SAMPLE_RATE = 22050
LOG_MEL_FLOOR = -11.5129  # log(1e-5), the floor used when the mels were made

sys.path.insert(0, str(VOCODER_DIR))
from env import AttrDict  # noqa: E402  (from hifi-gan)
from models import Generator  # noqa: E402  (from hifi-gan)

from frontend import phoneme_token_ids  # noqa: E402
from model import TTSStudentModel  # noqa: E402

CHECKPOINT_FORMAT_VERSION = 6
INPUT_ENCODING = "espeak_ipa_codepoint_bos_eos"


def load_student(device):
    checkpoint = torch.load(CHECKPOINT_PATH, map_location=device, weights_only=True)
    if (
        not isinstance(checkpoint, dict)
        or checkpoint.get("format_version") != CHECKPOINT_FORMAT_VERSION
        or checkpoint.get("input_encoding") != INPUT_ENCODING
    ):
        raise RuntimeError(
            "This checkpoint was not trained with the duration-based student. "
            "Run gen_teacher_data.py, then `python train.py --restart`."
        )

    model = TTSStudentModel(
        vocab_size=checkpoint["vocab_size"],
        hidden_dim=checkpoint["hidden_dim"],
    ).to(device)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    return model


def load_vocoder(device):
    with open(VOCODER_DIR / "config_v3.json", encoding="utf-8") as f:
        h = AttrDict(json.load(f))
    generator = Generator(h).to(device)
    state = torch.load(VOCODER_CKPT, map_location=device, weights_only=True)
    generator.load_state_dict(state["generator"])
    generator.eval()
    generator.remove_weight_norm()
    return generator


def synthesize(text, output_path, speed=1.0):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = load_student(device)
    vocoder = load_vocoder(device)
    tokens = torch.tensor(
        [phoneme_token_ids(text, model.vocab_size)], dtype=torch.long, device=device
    )

    with torch.inference_mode():
        predicted_mels, _, frame_lengths = model(tokens, speed=speed)
        mel = predicted_mels.transpose(1, 2).clamp(min=LOG_MEL_FLOOR)
        waveform = vocoder(mel)

    sf.write(output_path, waveform.squeeze().cpu().numpy(), VOCODER_SAMPLE_RATE)
    print(f"Saved synthesized audio to {output_path}")
    print(f"Sample rate: {VOCODER_SAMPLE_RATE} Hz, {int(frame_lengths[0])} mel frames")


def main():
    parser = argparse.ArgumentParser(
        description="Synthesize speech using the trained student checkpoint."
    )
    parser.add_argument("text", nargs="?", default="Hello world")
    parser.add_argument(
        "--output",
        default=str(TRAINING_DIR / "output_synthesized.wav"),
        help="Path for the generated WAV file.",
    )
    parser.add_argument(
        "--speed",
        type=float,
        default=1.0,
        help="Speaking rate; above 1 is faster (default: 1.0).",
    )
    args = parser.parse_args()
    synthesize(args.text, args.output, args.speed)


if __name__ == "__main__":
    main()
