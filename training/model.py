import math

import torch
import torch.nn as nn
from torch.nn.utils.rnn import pack_padded_sequence, pad_packed_sequence


class TTSStudentModel(nn.Module):
    """Predicts a teacher mel spectrogram from eSpeak phoneme symbols."""

    def __init__(self, vocab_size=10000, hidden_dim=256, max_frames=1600):
        super().__init__()
        if hidden_dim % 2:
            raise ValueError("hidden_dim must be even for the bidirectional encoder.")

        self.vocab_size = vocab_size
        self.hidden_dim = hidden_dim
        self.max_frames = max_frames
        self.embedding = nn.Embedding(vocab_size, hidden_dim, padding_idx=0)
        self.encoder = nn.LSTM(
            input_size=hidden_dim,
            hidden_size=hidden_dim // 2,
            num_layers=2,
            batch_first=True,
            bidirectional=True,
        )
        decoder_layer = nn.TransformerDecoderLayer(
            d_model=hidden_dim,
            nhead=4,
            dim_feedforward=hidden_dim * 4,
            dropout=0.1,
            batch_first=True,
        )
        self.decoder = nn.TransformerDecoder(decoder_layer, num_layers=2)
        self.register_buffer(
            "relative_frequencies",
            math.pi * torch.logspace(0, 10, hidden_dim // 2, base=2.0),
            persistent=False,
        )
        self.query_projection = nn.Linear(hidden_dim, hidden_dim)
        self.mel_head = nn.Linear(hidden_dim, 80)
        self.length_head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, 1),
        )

    def _relative_encoding(self, lengths, size):
        # Position as a fraction of each sample's own length, so frames can align to tokens.
        positions = torch.arange(size, device=lengths.device, dtype=torch.float32)
        relative = positions.unsqueeze(0) / lengths.clamp(min=1).unsqueeze(1).float()
        angles = relative.unsqueeze(-1) * self.relative_frequencies
        return torch.cat([angles.sin(), angles.cos()], dim=-1)

    def forward(self, tokens, max_frames, frame_lengths=None):
        if tokens.ndim != 2 or tokens.size(1) == 0:
            raise ValueError("tokens must have shape (batch, non-empty sequence).")
        if max_frames < 1 or max_frames > self.max_frames:
            raise ValueError(f"max_frames must be between 1 and {self.max_frames}.")
        if frame_lengths is not None:
            if frame_lengths.ndim != 1 or frame_lengths.size(0) != tokens.size(0):
                raise ValueError("frame_lengths must have shape (batch,).")
            if torch.any(frame_lengths < 1) or torch.any(frame_lengths > max_frames):
                raise ValueError("frame_lengths must be between 1 and max_frames.")

        token_mask = tokens.eq(0)
        token_lengths = (~token_mask).sum(dim=1)
        if torch.any(token_lengths == 0):
            raise ValueError("Each input must contain at least one non-padding token.")

        embedded = self.embedding(tokens)
        packed = pack_padded_sequence(
            embedded,
            token_lengths.cpu(),
            batch_first=True,
            enforce_sorted=False,
        )
        encoded, _ = self.encoder(packed)
        encoded, _ = pad_packed_sequence(
            encoded, batch_first=True, total_length=tokens.size(1)
        )

        valid_tokens = (~token_mask).unsqueeze(-1)
        pooled = (encoded * valid_tokens).sum(dim=1) / token_lengths.unsqueeze(-1)
        log_frame_count = self.length_head(pooled).squeeze(-1)

        if frame_lengths is None:
            frame_lengths = torch.full(
                (tokens.size(0),), max_frames, device=tokens.device, dtype=torch.long
            )
        positions = torch.arange(max_frames, device=tokens.device)
        frame_padding_mask = positions.unsqueeze(0) >= frame_lengths.unsqueeze(1)
        frame_encoding = self._relative_encoding(frame_lengths, max_frames)
        queries = self.query_projection(frame_encoding)
        memory = encoded + self._relative_encoding(token_lengths, tokens.size(1))
        decoded = self.decoder(
            tgt=queries + frame_encoding,
            memory=memory,
            memory_key_padding_mask=token_mask,
            tgt_key_padding_mask=frame_padding_mask,
        )
        return self.mel_head(decoded), log_frame_count
