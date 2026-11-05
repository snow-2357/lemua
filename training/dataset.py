import math
import os

import numpy as np
import soundfile as sf
import torch
import torchaudio
from torch.utils.data import Dataset
from torchaudio.prototype.pipelines import HIFIGAN_VOCODER_V3_LJSPEECH

from frontend import chunk_token_ids

HOP_LENGTH = 256
SILENCE_LOG_MEL = math.log(1e-5)


class TTSTeacherDataset(Dataset):
    """Loads phoneme tokens, per-token frame durations and mel targets from teacher audio."""

    def __init__(
        self,
        cache_dir: str | os.PathLike[str] = "dataset_cache",
        max_frames: int | None = None,
    ):
        self.cache_dir = os.fspath(cache_dir)
        if not os.path.isdir(self.cache_dir):
            raise FileNotFoundError(f"Dataset cache directory not found: {self.cache_dir}")

        self.sample_rate = int(HIFIGAN_VOCODER_V3_LJSPEECH.sample_rate)

        self.sentence_dirs = []
        self.tokens = []
        self.durations = []
        skipped = 0
        for name in sorted(os.listdir(self.cache_dir)):
            sentence_dir = os.path.join(self.cache_dir, name)
            phonemes_path = os.path.join(sentence_dir, "phonemes.txt")
            ends_path = os.path.join(sentence_dir, "token_end_samples.npy")
            audio_path = os.path.join(sentence_dir, "audio.wav")
            if not all(map(os.path.isfile, (phonemes_path, ends_path, audio_path))):
                skipped += 1
                continue

            with open(phonemes_path, encoding="utf-8") as phonemes_file:
                chunks = [line for line in phonemes_file.read().split("\n") if line]
            token_ids = chunk_token_ids(chunks)
            end_samples = np.load(ends_path)
            if not chunks or len(token_ids) != len(end_samples):
                skipped += 1
                continue

            # Round cumulative boundaries (not each duration) so the total never drifts.
            source_rate = sf.info(audio_path).samplerate
            frame_ends = np.round(end_samples * self.sample_rate / source_rate / HOP_LENGTH)
            durations = np.diff(np.concatenate([[0], frame_ends])).astype(np.int64)
            total_frames = int(durations.sum())
            if np.any(durations < 0) or total_frames < 1:
                skipped += 1
                continue
            if max_frames is not None and total_frames > max_frames:
                skipped += 1
                continue

            self.sentence_dirs.append(sentence_dir)
            self.tokens.append(token_ids)
            self.durations.append(durations)

        if skipped:
            print(f"Skipped {skipped} incomplete, mismatched, or too-long samples.")
        if not self.sentence_dirs:
            raise ValueError(
                f"No usable sentence folders found in {self.cache_dir}. "
                "Regenerate it with gen_teacher_data.py."
            )

        self.mel_transform = HIFIGAN_VOCODER_V3_LJSPEECH.get_mel_transform()

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
        durations = torch.from_numpy(self.durations[idx])
        total_frames = int(durations.sum())
        # The STFT framing can differ from the duration total by a frame or two.
        if mel.size(0) >= total_frames:
            mel = mel[:total_frames]
        else:
            padding = mel.new_full((total_frames - mel.size(0), mel.size(1)), SILENCE_LOG_MEL)
            mel = torch.cat([mel, padding])
        return {
            "tokens": torch.tensor(self.tokens[idx], dtype=torch.long),
            "durations": durations,
            "mel": mel,
        }
