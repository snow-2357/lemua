import os

import numpy as np
import soundfile as sf
import torch
import torchaudio
from torch.utils.data import Dataset
from torchaudio.prototype.pipelines import HIFIGAN_VOCODER_V3_LJSPEECH


class TTSTeacherDataset(Dataset):
    """Loads Kokoro phoneme tokens and mel targets from the cached teacher audio."""

    def __init__(self, cache_dir: str | os.PathLike[str] = "dataset_cache"):
        self.cache_dir = os.fspath(cache_dir)
        if not os.path.isdir(self.cache_dir):
            raise FileNotFoundError(f"Dataset cache directory not found: {self.cache_dir}")

        self.sentence_dirs = sorted(
            os.path.join(self.cache_dir, name)
            for name in os.listdir(self.cache_dir)
            if os.path.isdir(os.path.join(self.cache_dir, name))
        )
        if not self.sentence_dirs:
            raise ValueError(f"No sentence folders found in {self.cache_dir}.")

        self.sample_rate = int(HIFIGAN_VOCODER_V3_LJSPEECH.sample_rate)
        self.mel_transform = (
            HIFIGAN_VOCODER_V3_LJSPEECH.get_mel_transform()
        )

    def __len__(self):
        return len(self.sentence_dirs)

    def __getitem__(self, idx):
        sentence_dir = self.sentence_dirs[idx]
        tokens = np.load(os.path.join(sentence_dir, "tokens.npy"))
        if tokens.ndim != 1 or tokens.size == 0:
            raise ValueError(f"Invalid phoneme token sequence in {sentence_dir}.")
        if np.any(tokens < 0) or np.any(tokens >= 10000):
            raise ValueError(f"Phoneme token IDs must be in [0, 10000) in {sentence_dir}.")

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

        mel = self.mel_transform(waveform).squeeze(0).transpose(0, 1)
        return {
            "tokens": torch.from_numpy(tokens.astype(np.int64, copy=False)),
            "mel": mel,
        }
