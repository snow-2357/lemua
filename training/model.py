import torch
import torch.nn as nn
from torch.nn.utils.rnn import pack_padded_sequence, pad_packed_sequence, pad_sequence


def _run_lstm(lstm, inputs, lengths):
    packed = pack_padded_sequence(
        inputs, lengths.cpu(), batch_first=True, enforce_sorted=False
    )
    outputs, _ = lstm(packed)
    outputs, _ = pad_packed_sequence(
        outputs, batch_first=True, total_length=inputs.size(1)
    )
    return outputs


class TTSStudentModel(nn.Module):
    """FastSpeech-style student: phonemes -> per-phoneme durations -> mel frames."""

    def __init__(self, vocab_size=10000, hidden_dim=256, max_frames=1600):
        super().__init__()
        if hidden_dim % 2:
            raise ValueError("hidden_dim must be even for the bidirectional LSTMs.")

        self.vocab_size = vocab_size
        self.hidden_dim = hidden_dim
        self.max_frames = max_frames
        self.embedding = nn.Embedding(vocab_size, hidden_dim, padding_idx=0)
        self.encoder = nn.LSTM(
            hidden_dim, hidden_dim // 2, num_layers=2, batch_first=True, bidirectional=True
        )
        self.duration_head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(hidden_dim, 1),
        )
        self.frame_position = nn.Linear(1, hidden_dim)
        self.decoder = nn.LSTM(
            hidden_dim, hidden_dim // 2, num_layers=2, batch_first=True, bidirectional=True
        )
        self.mel_head = nn.Linear(hidden_dim, 80)

    def encode(self, tokens):
        if tokens.ndim != 2 or tokens.size(1) == 0:
            raise ValueError("tokens must have shape (batch, non-empty sequence).")
        token_mask = tokens.ne(0)
        token_lengths = token_mask.sum(dim=1)
        if torch.any(token_lengths == 0):
            raise ValueError("Each input must contain at least one non-padding token.")

        encoded = _run_lstm(self.encoder, self.embedding(tokens), token_lengths)
        log_durations = self.duration_head(encoded).squeeze(-1).masked_fill(~token_mask, 0.0)
        return encoded, log_durations

    def predict_durations(self, tokens, log_durations, speed=1.0):
        token_mask = tokens.ne(0)
        durations = (torch.expm1(log_durations) / speed).round().clamp(min=0).long()
        durations = durations.masked_fill(~token_mask, 0)
        empty = durations.sum(dim=1) == 0
        durations[empty] = token_mask[empty].long()
        return durations

    def decode(self, encoded, durations):
        frame_lengths = durations.sum(dim=1)
        if torch.any(frame_lengths < 1) or torch.any(frame_lengths > self.max_frames):
            raise ValueError(f"Total frames must be between 1 and {self.max_frames}.")

        expanded = []
        for sample_encoded, sample_durations in zip(encoded, durations):
            token_index = torch.repeat_interleave(
                torch.arange(sample_durations.numel(), device=durations.device),
                sample_durations,
            )
            starts = torch.cumsum(sample_durations, dim=0) - sample_durations
            offset = torch.arange(token_index.numel(), device=durations.device) - starts[token_index]
            # Where each frame sits inside its phoneme (0..1), so stretched copies differ.
            fraction = (offset.float() + 0.5) / sample_durations[token_index].float()
            expanded.append(
                sample_encoded[token_index] + self.frame_position(fraction.unsqueeze(-1))
            )
        frames = pad_sequence(expanded, batch_first=True)
        decoded = _run_lstm(self.decoder, frames, frame_lengths)
        return self.mel_head(decoded), frame_lengths

    def forward(self, tokens, durations):
        encoded, log_durations = self.encode(tokens)
        mels, frame_lengths = self.decode(encoded, durations)
        return mels, log_durations, frame_lengths
