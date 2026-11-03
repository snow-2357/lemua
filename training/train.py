from pathlib import Path

import torch
import torch.nn.functional as F
from torch.nn.utils.rnn import pad_sequence
from torch.utils.data import DataLoader

from dataset import TTSTeacherDataset
from model import TTSStudentModel


TRAINING_DIR = Path(__file__).resolve().parent
VOCAB_SIZE = 10000
HIDDEN_DIM = 256
MAX_FRAMES = 1600
BATCH_SIZE = 8
EPOCHS = 30


def tts_collate_fn(batch):
    tokens = pad_sequence(
        [item["tokens"] for item in batch], batch_first=True, padding_value=0
    )
    mels = pad_sequence(
        [item["mel"] for item in batch], batch_first=True, padding_value=0.0
    )
    frame_lengths = torch.tensor([item["mel"].size(0) for item in batch])
    return tokens, mels, frame_lengths


def main():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Training on device: {device}")

    dataset = TTSTeacherDataset(str(TRAINING_DIR / "dataset_cache"))
    dataloader = DataLoader(
        dataset,
        batch_size=BATCH_SIZE,
        shuffle=True,
        collate_fn=tts_collate_fn,
    )
    print(f"Loaded {len(dataset)} paired text/audio samples.")

    model = TTSStudentModel(
        vocab_size=VOCAB_SIZE, hidden_dim=HIDDEN_DIM, max_frames=MAX_FRAMES
    ).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4)

    for epoch in range(EPOCHS):
        model.train()
        total_loss = 0.0

        for tokens, target_mels, frame_lengths in dataloader:
            tokens = tokens.to(device)
            target_mels = target_mels.to(device)
            frame_lengths = frame_lengths.to(device)
            frame_count = target_mels.size(1)
            if frame_count > MAX_FRAMES:
                raise ValueError(
                    f"Audio needs {frame_count} mel frames; increase MAX_FRAMES."
                )

            predicted_mels, predicted_log_lengths = model(tokens, frame_count)
            frame_mask = (
                torch.arange(frame_count, device=device).unsqueeze(0)
                < frame_lengths.unsqueeze(1)
            )
            mel_loss = F.l1_loss(predicted_mels[frame_mask], target_mels[frame_mask])
            length_loss = F.mse_loss(
                predicted_log_lengths, torch.log1p(frame_lengths.float())
            )
            loss = mel_loss + 0.1 * length_loss

            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            total_loss += loss.item()

        average_loss = total_loss / len(dataloader)
        print(f"Epoch [{epoch + 1}/{EPOCHS}] | Average loss: {average_loss:.4f}")

    checkpoint_path = TRAINING_DIR / "tts_student_model.pth"
    torch.save(
        {
            "format_version": 2,
            "model_state_dict": model.state_dict(),
            "vocab_size": VOCAB_SIZE,
            "hidden_dim": HIDDEN_DIM,
            "max_frames": MAX_FRAMES,
        },
        checkpoint_path,
    )
    print(f"Training complete. Model saved to {checkpoint_path}")


if __name__ == "__main__":
    main()
