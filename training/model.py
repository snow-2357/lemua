import torch
import torch.nn as nn


class TTSStudentModel(nn.Module):
    """A lightweight student model that predicts durations, pitch, and loudness from phoneme token sequences."""

    def __init__(self, vocab_size=10000, embed_dim=256, hidden_dim=256):
        super().__init__()
        # 1. Token Embedding (converts phoneme IDs into dense vectors)
        self.embedding = nn.Embedding(vocab_size, embed_dim, padding_idx=0)

        # 2. Sequence Encoder (BiLSTM is fast, lightweight, and stable for sequence tasks)
        self.encoder = nn.LSTM(
            input_size=embed_dim,
            hidden_size=hidden_dim // 2,
            num_layers=2,
            batch_first=True,
            bidirectional=True,
        )

        # 3. Predictor Heads (maps hidden states to target acoustic features)
        self.duration_head = nn.Sequential(
            nn.Linear(hidden_dim, 128), nn.ReLU(), nn.Linear(128, 1)
        )

        self.pitch_head = nn.Sequential(
            nn.Linear(hidden_dim, 128), nn.ReLU(), nn.Linear(128, 1)
        )

        self.loudness_head = nn.Sequential(
            nn.Linear(hidden_dim, 128), nn.ReLU(), nn.Linear(128, 1)
        )

    def forward(self, tokens):
        # tokens shape: (Batch, Seq_Len)
        x = self.embedding(tokens)

        # Encoder processing
        encoded, _ = self.encoder(x)  # (Batch, Seq_Len, Hidden_Dim)

        # Predict acoustic properties
        durations = self.duration_head(encoded).squeeze(-1)
        pitch = self.pitch_head(encoded).squeeze(-1)
        loudness = self.loudness_head(encoded).squeeze(-1)

        return durations, pitch, loudness
