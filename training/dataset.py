import math
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

    def __init__(
        self,
        cache_dir: str | os.PathLike[str] = "dataset_cache",
        max_frames: int | None = None,
    ):
        self.cache_dir = os.fspath(cache_dir)
        if not os.path.isdir(self.cache_dir):
            raise FileNotFoundError(f"Dataset cache directory not found: {self.cache_dir}")

        self.sample_rate = int(HIFIGAN_VOCODER_V3_LJSPEECH.sample_rate)
        hop_length = 256

        self.sentence_dirs = []
        self.tokens = []
        skipped = 0
        for name in sorted(os.listdir(self.cache_dir)):
            sentence_dir = os.path.join(self.cache_dir, name)
            text_path = os.path.join(sentence_dir, "text.txt")
            audio_path = os.path.join(sentence_dir, "audio.wav")
            if not (os.path.isfile(text_path) and os.path.isfile(audio_path)):
                skipped += 1
                continue
            if max_frames is not None:
                info = sf.info(audio_path)
                resampled = math.ceil(info.frames * self.sample_rate / info.samplerate)
                if resampled // hop_length + 1 > max_frames:
                    skipped += 1
                    continue
            with open(text_path, encoding="utf-8") as text_file:
                text = text_file.read().strip()
            if not text:
                skipped += 1
                continue
            self.sentence_dirs.append(sentence_dir)
            self.tokens.append(phoneme_token_ids(text))

        if skipped:
            print(f"Skipped {skipped} incomplete, empty, or too-long samples.")
        if not self.sentence_dirs:
            raise ValueError(f"No usable sentence folders found in {self.cache_dir}.")

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
