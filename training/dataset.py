import os
import numpy as np
import torch
from torch.utils.data import Dataset


class TTSTeacherDataset(Dataset):
    """This file acts as the bridge that allows PyTorch to read your .npy files and text on the fly during training."""

    def __init__(self, cache_dir="dataset_cache"):
        self.cache_dir = cache_dir
        # Find and sort all sentence folders dynamically
        self.sentence_dirs = sorted(
            [
                os.path.join(cache_dir, d)
                for d in os.listdir(cache_dir)
                if os.path.isdir(os.path.join(cache_dir, d))
            ]
        )

    def __len__(self):
        return len(self.sentence_dirs)

    def __getitem__(self, idx):
        s_dir = self.sentence_dirs[idx]

        # Load binary numpy files into memory
        tokens = np.load(os.path.join(s_dir, "tokens.npy"))
        durations = np.load(os.path.join(s_dir, "durations.npy"))
        pitch = np.load(os.path.join(s_dir, "pitch.npy"))
        loudness = np.load(os.path.join(s_dir, "loudness.npy"))

        with open(os.path.join(s_dir, "text.txt"), "r", encoding="utf-8") as f:
            text = f.read().strip()

        # Convert everything into PyTorch tensors
        return {
            "text": text,
            "tokens": torch.tensor(tokens, dtype=torch.long),
            "durations": torch.tensor(durations, dtype=torch.float32),
            "pitch": torch.tensor(pitch, dtype=torch.float32),
            "loudness": torch.tensor(loudness, dtype=torch.float32),
        }
