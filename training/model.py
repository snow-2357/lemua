import math

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.nn.utils.rnn import pack_padded_sequence, pad_packed_sequence


class ConvBlock(nn.Module):
    """Pre-norm residual block: LayerNorm -> dilated conv -> GELU -> linear."""

    def __init__(self, dim, kernel_size=5, dilation=1, dropout=0.1):
        super().__init__()
        self.norm = nn.LayerNorm(dim)
        self.conv = nn.Conv1d(
            dim,
            dim,
            kernel_size,
            padding=dilation * (kernel_size - 1) // 2,
            dilation=dilation,
        )
        self.proj = nn.Linear(dim, dim)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x, mask):
        # x: (batch, frames, dim); mask: (batch, frames, 1), 1.0 on real frames
        y = self.norm(x) * mask
        y = self.conv(y.transpose(1, 2)).transpose(1, 2)
        y = self.proj(F.gelu(y))
        return (x + self.dropout(y)) * mask


class TTSStudentModel(nn.Module):
    """eSpeak phoneme tokens -> log-mel, with an explicit duration per token.

    1. A BiLSTM encodes the phoneme sequence.
    2. A duration head predicts how many mel frames each token lasts.
    3. A length regulator repeats each token's encoding for its duration, so
       the decoder gets one input per frame, already aligned and in order.
    4. A convolutional decoder turns those frames into mel frames.

    Training passes the teacher's durations; inference uses predicted ones.
    """

    def __init__(self, vocab_size=10000, hidden_dim=256, num_decoder_blocks=6):
        super().__init__()
        if hidden_dim % 2:
            raise ValueError("hidden_dim must be even for the bidirectional encoder.")

        self.vocab_size = vocab_size
        self.hidden_dim = hidden_dim

        self.embedding = nn.Embedding(vocab_size, hidden_dim, padding_idx=0)
        self.encoder = nn.LSTM(
            input_size=hidden_dim,
            hidden_size=hidden_dim // 2,
            num_layers=2,
            batch_first=True,
            bidirectional=True,
            dropout=0.1,
        )
        self.duration_head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(hidden_dim, 1),
        )

        # Where the frame sits inside its token: 0 at the start, ->1 at the end.
        self.within_projection = nn.Linear(5, hidden_dim)
        dilations = [1, 2, 4, 1, 2, 4, 1, 2][:num_decoder_blocks]
        self.decoder = nn.ModuleList(
            [ConvBlock(hidden_dim, kernel_size=5, dilation=d) for d in dilations]
        )
        self.output_norm = nn.LayerNorm(hidden_dim)
        self.mel_head = nn.Linear(hidden_dim, 80)
        # Start near the average log-mel level so training begins close to the data.
        nn.init.constant_(self.mel_head.bias, -6.0)

    def encode(self, tokens):
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
        return encoded, token_mask

    @staticmethod
    def length_regulate(encoded, durations):
        """Repeat each token's vector for `durations` frames (all batched)."""
        batch, num_tokens, dim = encoded.shape
        ends = durations.cumsum(dim=1)  # (batch, tokens), non-decreasing
        frame_lengths = ends[:, -1]
        max_len = max(1, int(frame_lengths.max().item()))

        positions = (
            torch.arange(max_len, device=encoded.device)
            .unsqueeze(0)
            .expand(batch, -1)
            .contiguous()
        )
        # First token whose end is past this frame = the token that owns it.
        token_index = torch.searchsorted(ends.contiguous(), positions, right=True)
        token_index = token_index.clamp(max=num_tokens - 1)

        expanded = encoded.gather(1, token_index.unsqueeze(-1).expand(-1, -1, dim))
        starts = (ends - durations).gather(1, token_index)
        own_duration = durations.gather(1, token_index).clamp(min=1)
        within = (positions - starts).float() / own_duration.float()
        frame_mask = positions < frame_lengths.unsqueeze(1)
        return expanded, within, frame_mask, frame_lengths

    def forward(self, tokens, durations=None, speed=1.0):
        """Returns (mel, predicted_log_durations, frame_lengths).

        mel: (batch, frames, 80); predicted_log_durations: (batch, tokens),
        in log1p(mel frames). Pass teacher `durations` (batch, tokens) long
        while training; leave None at inference to use the predicted ones.
        """
        if tokens.ndim != 2 or tokens.size(1) == 0:
            raise ValueError("tokens must have shape (batch, non-empty sequence).")

        encoded, token_mask = self.encode(tokens)
        log_durations = self.duration_head(encoded).squeeze(-1)

        if durations is None:
            frames = torch.expm1(log_durations.detach().clamp(min=0.0)) / speed
            durations = frames.round().long()
            durations = durations.masked_fill(token_mask, 0)
            # Never produce an empty utterance.
            durations[:, 0] = durations[:, 0].clamp(min=1)
        else:
            durations = durations.masked_fill(token_mask, 0)

        expanded, within, frame_mask, frame_lengths = self.length_regulate(
            encoded, durations
        )
        angle = within * math.pi
        within_features = torch.stack(
            [within, angle.sin(), angle.cos(), (2 * angle).sin(), (2 * angle).cos()],
            dim=-1,
        )
        mask = frame_mask.unsqueeze(-1).to(expanded.dtype)
        x = (expanded + self.within_projection(within_features)) * mask
        for block in self.decoder:
            x = block(x, mask)
        mel = self.mel_head(self.output_norm(x)) * mask
        return mel, log_durations, frame_lengths
