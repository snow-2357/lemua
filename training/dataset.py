import os

import numpy as np
import soundfile as sf
import torch
import torchaudio
from torch.utils.data import Dataset
from torchaudio.prototype.pipelines import HIFIGAN_VOCODER_V3_LJSPEECH

from frontend import phoneme_token_ids


class TTSTeacherDataset(Dataset):
    """Loads phoneme tokens and mel targets from cached teacher audio."""

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

        self.tokens = []
        for sentence_dir in self.sentence_dirs:
            text_path = os.path.join(sentence_dir, "text.txt")
            with open(text_path, encoding="utf-8") as text_file:
                text = text_file.read().strip()
            if not text:
                raise ValueError(f"Empty training text in {text_path}.")
            self.tokens.append(phoneme_token_ids(text))

        self.sample_rate = int(HIFIGAN_VOCODER_V3_LJSPEECH.sample_rate)
        self.mel_transform = (
            HIFIGAN_VOCODER_V3_LJSPEECH.get_mel_transform()
        )

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

        mel = self.mel_transform(waveform).squeeze(0).transpose(0, 1)
        return {
            "tokens": torch.tensor(self.tokens[idx], dtype=torch.long),
            "mel": mel,
        }
