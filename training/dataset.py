import math
import os

import numpy as np
import soundfile as sf
import torch
import torchaudio
from torch.utils.data import Dataset

from frontend import phonemes_to_token_ids

# Mel settings for HiFi-GAN LJ_V3 (must match hifi-gan/config_v3.json)
SAMPLE_RATE = 22050
N_FFT = 1024
WIN_LENGTH = 1024
HOP_LENGTH = 256
N_MELS = 80
F_MIN = 0.0
F_MAX = 8000.0


class HiFiGANMel(torch.nn.Module):
    """Log-mel transform matching the original HiFi-GAN preprocessing."""

    def __init__(self):
        super().__init__()
        self.mel = torchaudio.transforms.MelSpectrogram(
            sample_rate=SAMPLE_RATE,
            n_fft=N_FFT,
            win_length=WIN_LENGTH,
            hop_length=HOP_LENGTH,
            f_min=F_MIN,
            f_max=F_MAX,
            n_mels=N_MELS,
            power=1.0,
            norm="slaney",
            mel_scale="slaney",
            center=False,
        )
        self.pad = (N_FFT - HOP_LENGTH) // 2

    def forward(self, waveform):
        # waveform: (batch, samples)
        waveform = torch.nn.functional.pad(
            waveform.unsqueeze(1), (self.pad, self.pad), mode="reflect"
        ).squeeze(1)
        return torch.log(torch.clamp(self.mel(waveform), min=1e-5))


def durations_to_mel_frames(raw_durations, total_frames):
    """Rescale Kokoro durations so they sum to exactly `total_frames`.

    Kokoro's duration units and our mel hop differ, but both cover the same
    audio, so each token's share of the total is what carries over. Boundaries
    are rounded on the running total, so rounding errors never accumulate.
    """
    raw = np.asarray(raw_durations, dtype=np.float64)
    bounds = np.rint(np.cumsum(raw) / raw.sum() * total_frames).astype(np.int64)
    return np.diff(bounds, prepend=0)


class TTSTeacherDataset(Dataset):
    """Loads phoneme tokens, per-token durations and mel targets from teacher audio."""

    def __init__(
        self,
        cache_dir: str | os.PathLike[str] = "dataset_cache",
        max_frames: int | None = None,
        vocab_size: int = 10000,
    ):
        self.cache_dir = os.fspath(cache_dir)
        if not os.path.isdir(self.cache_dir):
            raise FileNotFoundError(
                f"Dataset cache directory not found: {self.cache_dir}"
            )

        self.sample_rate = SAMPLE_RATE

        self.sentence_dirs = []
        self.tokens = []
        self.durations = []
        skipped = 0
        for name in sorted(os.listdir(self.cache_dir)):
            sentence_dir = os.path.join(self.cache_dir, name)
            audio_path = os.path.join(sentence_dir, "audio.wav")
            phonemes_path = os.path.join(sentence_dir, "phonemes.txt")
            durations_path = os.path.join(sentence_dir, "durations.npy")
            if not (
                os.path.isfile(audio_path)
                and os.path.isfile(phonemes_path)
                and os.path.isfile(durations_path)
            ):
                skipped += 1
                continue

            info = sf.info(audio_path)
            resampled = math.ceil(info.frames * self.sample_rate / info.samplerate)
            frames = resampled // HOP_LENGTH  # center=False with reflect padding
            if frames < 1 or (max_frames is not None and frames > max_frames):
                skipped += 1
                continue

            with open(phonemes_path, encoding="utf-8") as phonemes_file:
                phonemes = phonemes_file.read().strip()
            if not phonemes:
                skipped += 1
                continue
            tokens = phonemes_to_token_ids(phonemes, vocab_size)
            durations = np.load(durations_path)
            if len(durations) != len(tokens) or durations.sum() <= 0:
                skipped += 1
                continue

            self.sentence_dirs.append(sentence_dir)
            self.tokens.append(tokens)
            self.durations.append(durations)

        if skipped:
            print(f"Skipped {skipped} incomplete, empty, or too-long samples.")
        if not self.sentence_dirs:
            raise ValueError(
                f"No usable sentence folders found in {self.cache_dir}. "
                "Run gen_teacher_data.py again so durations are saved."
            )

        self.mel_transform = HiFiGANMel()

    def __len__(self):
        return len(self.sentence_dirs)

    def __getitem__(self, idx):
        sentence_dir = self.sentence_dirs[idx]
        audio, sample_rate = sf.read(
            os.path.join(sentence_dir, "audio.wav"), dtype="float32"
        )
        if audio.ndim == 2:
            audio = audio.mean(axis=1)
        waveform = torch.from_numpy(np.ascontiguousarray(audio)).unsqueeze(0)
        if sample_rate != self.sample_rate:
            waveform = torchaudio.functional.resample(
                waveform, sample_rate, self.sample_rate
            )

        mel = self.mel_transform(waveform).squeeze(0).transpose(0, 1)  # (frames, 80)
        durations = durations_to_mel_frames(self.durations[idx], mel.size(0))
        return {
            "tokens": torch.tensor(self.tokens[idx], dtype=torch.long),
            "durations": torch.from_numpy(durations).long(),
            "mel": mel,
        }