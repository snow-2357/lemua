import argparse
import math
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import torch.nn as nn
from onnxruntime.quantization import QuantType, quantize_dynamic

# Setup paths
TRAINING_DIR = Path(__file__).resolve().parent
VOCODER_DIR = TRAINING_DIR / "hifi-gan"
sys.path.insert(0, str(VOCODER_DIR))
sys.path.insert(0, str(TRAINING_DIR / "src"))

from src import synthesize
from src.frontend import phoneme_token_ids

# Override paths in synthesize to point to root folders
synthesize.CHECKPOINT_PATH = TRAINING_DIR / "checkpoints" / "tts_student_model.pth"
synthesize.VOCODER_DIR = VOCODER_DIR
synthesize.VOCODER_VERSION = "v3"
synthesize.VOCODER_CKPT = TRAINING_DIR / "exports" / "generator_v3"
synthesize.VOCODER_CONFIG = VOCODER_DIR / "config_v3.json"

DEFAULT_OUTPUT = TRAINING_DIR / "checkpoints" / "lumua.onnx"
TEMP_FP32_OUTPUT = TRAINING_DIR / "checkpoints" / "lumua_fp32.onnx"

TEST_SENTENCES = [
    "Hello world",
    "The quick brown fox jumps over the lazy dog.",
]


class StudentPlusVocoder(nn.Module):
    """tokens (1, N) + speed (1,) -> waveform (samples,).

    Inference only, batch size 1. It mirrors TTSStudentModel.forward but uses
    operations that export to ONNX (no packed sequences, no searchsorted).
    """

    def __init__(self, student, vocoder):
        super().__init__()
        self.student = student
        self.vocoder = vocoder

    def forward(self, tokens, speed):
        s = self.student
        encoded, _ = s.encoder(s.embedding(tokens))  # (1, N, H)
        log_durations = s.duration_head(encoded).squeeze(-1)  # (1, N)
        # exp(x) - 1 == expm1(x); ONNX has no expm1 operator.
        frames = (torch.exp(log_durations.clamp(min=0.0)) - 1.0) / speed
        durations = frames.round().long()
        durations = torch.cat([durations[:, :1].clamp(min=1), durations[:, 1:]], dim=1)

        # Length regulator: each frame takes the token whose span contains it.
        ends = durations.cumsum(dim=1)  # (1, N)
        positions = torch.arange(ends[0, -1], device=tokens.device)  # (T,)
        token_index = (ends.unsqueeze(-1) <= positions.view(1, 1, -1)).sum(dim=1)[0]
        expanded = encoded[0].index_select(0, token_index)  # (T, H)
        starts = (ends - durations)[0].index_select(0, token_index)
        own = durations[0].index_select(0, token_index).clamp(min=1)
        within = (positions - starts).float() / own.float()

        angle = within * math.pi
        within_features = torch.stack(
            [within, angle.sin(), angle.cos(), (2 * angle).sin(), (2 * angle).cos()],
            dim=-1,
        )
        x = (expanded + s.within_projection(within_features)).unsqueeze(0)
        mask = torch.ones_like(x[..., :1])
        for block in s.decoder:
            x = block(x, mask)
        mel = s.mel_head(s.output_norm(x))  # (1, T, 80)
        mel = mel.transpose(1, 2).clamp(min=synthesize.LOG_MEL_FLOOR)
        return self.vocoder(mel).reshape(-1)


def main():
    parser = argparse.ArgumentParser(
        description="Export the student + HiFi-GAN vocoder as an INT8 quantized ONNX model."
    )
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--opset", type=int, default=17)
    args = parser.parse_args()

    device = torch.device("cpu")
    student = synthesize.load_student(device)
    vocoder = synthesize.load_vocoder(device)
    wrapper = StudentPlusVocoder(student, vocoder).eval()

    def tokens_for(text):
        return torch.tensor([phoneme_token_ids(text, student.vocab_size)])

    speed = torch.tensor([1.0])
    dummy_tokens = tokens_for(TEST_SENTENCES[0])

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)

    print(f"Exporting FP32 model graph to temporary file: {TEMP_FP32_OUTPUT}")
    with torch.no_grad():
        torch.onnx.export(
            wrapper,
            (dummy_tokens, speed),
            str(TEMP_FP32_OUTPUT),
            input_names=["tokens", "speed"],
            output_names=["waveform"],
            dynamic_axes={"tokens": {1: "num_tokens"}, "waveform": {0: "num_samples"}},
            opset_version=args.opset,
            dynamo=False,
        )

    print(f"Applying INT8 dynamic quantization -> {args.output}")
    quantize_dynamic(
        model_input=str(TEMP_FP32_OUTPUT),
        model_output=str(args.output),
        weight_type=QuantType.QInt8,
    )

    if Path(TEMP_FP32_OUTPUT).exists():
        Path(TEMP_FP32_OUTPUT).unlink()

    size_mb = Path(args.output).stat().st_size / 1e6
    print(f"Successfully exported INT8 ONNX model: {args.output} ({size_mb:.1f} MB)")

    try:
        import onnxruntime as ort
    except ImportError:
        print("onnxruntime is not installed; skipping verification.")
        return

    session = ort.InferenceSession(args.output, providers=["CPUExecutionProvider"])
    for text in TEST_SENTENCES:
        tokens = tokens_for(text)
        with torch.no_grad():
            expected = wrapper(tokens, speed).numpy()
        actual = session.run(
            None,
            {"tokens": tokens.numpy(), "speed": np.array([1.0], dtype=np.float32)},
        )[0]
        if actual.shape == expected.shape:
            diff = float(np.abs(actual - expected).max())
            print(
                f"{text!r}: {actual.shape[0]} samples, max diff vs PyTorch {diff:.2e}"
            )
        else:
            print(
                f"{text!r}: shape mismatch, ONNX {actual.shape} vs PyTorch {expected.shape}"
            )

    out_path = TRAINING_DIR / "outputs" / "onnx_test.wav"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(out_path, actual, synthesize.VOCODER_SAMPLE_RATE)
    print(f"Wrote {out_path}. Listen to it to confirm it matches synthesize.py.")


if __name__ == "__main__":
    main()
