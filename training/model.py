import torch
import torch.nn as nn
from torch.nn.utils.rnn import pack_padded_sequence, pad_packed_sequence


class TTSStudentModel(nn.Module):
    """Predicts a teacher mel spectrogram from Kokoro phoneme tokens."""

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
        self.frame_positions = nn.Embedding(max_frames, hidden_dim)
        self.mel_head = nn.Linear(hidden_dim, 80)
        self.length_head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, 1),
        )

    def forward(self, tokens, max_frames):
        if tokens.ndim != 2 or tokens.size(1) == 0:
            raise ValueError("tokens must have shape (batch, non-empty sequence).")
        if max_frames < 1 or max_frames > self.max_frames:
            raise ValueError(f"max_frames must be between 1 and {self.max_frames}.")

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

        positions = torch.arange(max_frames, device=tokens.device)
        queries = self.frame_positions(positions).unsqueeze(0).expand(
            tokens.size(0), -1, -1
        )
        decoded = self.decoder(
            tgt=queries,
            memory=encoded,
            memory_key_padding_mask=token_mask,
        )
        return self.mel_head(decoded), log_frame_count
