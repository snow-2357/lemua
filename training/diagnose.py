import argparse
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
import torch  # noqa: E402

from dataset import TTSTeacherDataset  # noqa: E402
from synthesize import (  # noqa: E402
    LOG_MEL_FLOOR,
    VOCODER_SAMPLE_RATE,
    load_student,
    load_vocoder,
)

TRAINING_DIR = Path(__file__).resolve().parent
OUT_DIR = TRAINING_DIR / "diagnose"


def find_clicks(wav, count=3):
    """Times (s) of the biggest sample-to-sample jumps, at least 50 ms apart."""
    jumps = np.abs(np.diff(wav))
    picked = []
    for i in np.argsort(jumps)[::-1]:
        if all(abs(int(i) - j) > VOCODER_SAMPLE_RATE // 20 for j in picked):
            picked.append(int(i))
        if len(picked) == count:
            break
    return [(i / VOCODER_SAMPLE_RATE, float(jumps[i])) for i in picked], float(
        np.median(jumps)
    )


def describe(name, mel, wav):
    m = mel.mean(0)
    low, mid, high = m[:27].mean().item(), m[27:54].mean().item(), m[54:].mean().item()
    print(f"\n[{name}] {mel.size(0)} frames, {len(wav) / VOCODER_SAMPLE_RATE:.2f} s")
    print(f"  mel mean {mel.mean().item():.2f}, std {mel.std().item():.2f}")
    print(f"  band means  low {low:.2f} | mid {mid:.2f} | high {high:.2f}")
    print(
        f"  first 3 frames {mel[:3].mean().item():.2f}, "
        f"last 3 frames {mel[-3:].mean().item():.2f}"
    )
    clicks, median = find_clicks(wav)
    where = ", ".join(f"{t:.2f}s (jump {j:.3f})" for t, j in clicks)
    print(f"  biggest sample jumps: {where}  [typical jump {median:.4f}]")


def main():
    parser = argparse.ArgumentParser(description="Compare teacher and student output.")
    parser.add_argument("--index", type=int, default=0, help="training sentence number")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    dataset = TTSTeacherDataset(str(TRAINING_DIR / "dataset_cache"), max_frames=1600)
    item = dataset[args.index]
    text = (Path(dataset.sentence_dirs[args.index]) / "text.txt").read_text(
        encoding="utf-8"
    )
    print(f"Sentence {args.index}: {text}")

    tokens = item["tokens"].unsqueeze(0).to(device)
    teacher_durations = item["durations"].unsqueeze(0).to(device)
    target = item["mel"].unsqueeze(0).to(device)  # (1, frames, 80)

    model = load_student(device)
    vocoder = load_vocoder(device)

    with torch.inference_mode():
        mel_teacher_dur, log_durations, _ = model(tokens, teacher_durations)
        mel_predicted_dur, _, _ = model(tokens)

        predicted = (torch.exp(log_durations.clamp(min=0.0)) - 1.0).round()
        error = (predicted - teacher_durations.float()).abs().mean().item()
        print(
            f"Durations: teacher total {int(teacher_durations.sum())} frames, "
            f"predicted total {int(predicted.sum())}, mean error {error:.2f} frames/token"
        )

        mels = {
            "1_teacher_mel": target,
            "2_student_teacher_durations": mel_teacher_dur,
            "3_student_predicted_durations": mel_predicted_dur,
        }
        OUT_DIR.mkdir(exist_ok=True)
        for name, mel in mels.items():
            wav = vocoder(mel.transpose(1, 2).clamp(min=LOG_MEL_FLOOR))
            wav = wav.squeeze().cpu().numpy()
            sf.write(OUT_DIR / f"{name}.wav", wav, VOCODER_SAMPLE_RATE)
            describe(name, mel[0].cpu(), wav)

    low, high = target.min().item(), target.max().item()
    fig, axes = plt.subplots(3, 1, figsize=(10, 9))
    for ax, (name, mel) in zip(axes, mels.items()):
        ax.imshow(mel[0].T.cpu(), origin="lower", aspect="auto", vmin=low, vmax=high)
        ax.set_title(name)
    fig.tight_layout()
    fig.savefig(OUT_DIR / "mels.png", dpi=100)
    print(f"\nSaved 3 wav files and mels.png in {OUT_DIR}")


if __name__ == "__main__":
    main()
