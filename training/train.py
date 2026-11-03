import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torch.nn.utils.rnn import pad_sequence
from dataset import TTSTeacherDataset
from model import TTSStudentModel


def tts_collate_fn(batch):
    """
    Handles variable-length sequences in each batch by padding them
    so they can be processed efficiently in parallel.
    """
    # Sort batch by token length descending (good practice for RNN/Transformer efficiency)
    batch = sorted(batch, key=lambda x: len(x["tokens"]), reverse=True)

    tokens = [item["tokens"] for item in batch]
    durations = [item["durations"] for item in batch]
    pitch = [item["pitch"] for item in batch]
    loudness = [item["loudness"] for item in batch]

    # Pad sequences with zeros to match the longest sequence in the batch
    tokens_padded = pad_sequence(tokens, batch_first=True, padding_value=0)
    durations_padded = pad_sequence(durations, batch_first=True, padding_value=0.0)
    pitch_padded = pad_sequence(pitch, batch_first=True, padding_value=0.0)
    loudness_padded = pad_sequence(loudness, batch_first=True, padding_value=0.0)

    return {
        "tokens": tokens_padded,
        "durations": durations_padded,
        "pitch": pitch_padded,
        "loudness": loudness_padded,
    }


def main():
    # 1. Setup Device & Data Loader
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Training on device: {device}")

    dataset = TTSTeacherDataset(cache_dir="dataset_cache")
    dataloader = DataLoader(
        dataset, batch_size=8, shuffle=True, collate_fn=tts_collate_fn
    )
    print(f"Loaded {len(dataset)} samples into DataLoader.")

    # 2. Initialize Model, Optimizer, and Loss Function
    model = TTSStudentModel(vocab_size=10000).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3)
    criterion = nn.MSELoss()

    # 3. Training Loop
    EPOCHS = 10
    model.train()

    print("Starting training loop...")
    for epoch in range(EPOCHS):
        total_loss = 0.0

        for batch_idx, batch in enumerate(dataloader):
            tokens = batch["tokens"].to(device)
            target_durations = batch["durations"].to(device)

            # Forward pass through the student model
            pred_durations, pred_pitch, pred_loudness = model(tokens)

            # Match lengths for loss computation
            min_len = min(pred_durations.size(1), target_durations.size(1))

            # Calculate Mean Squared Error loss against teacher duration targets
            loss = criterion(pred_durations[:, :min_len], target_durations[:, :min_len])

            # Backpropagation & Optimization step
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            total_loss += loss.item()

        avg_loss = total_loss / len(dataloader)
        print(f"Epoch [{epoch+1}/{EPOCHS}] | Average Loss: {avg_loss:.4f}")

    # 4. Save Trained Weights
    torch.save(model.state_dict(), "tts_student_model.pth")
    print("Training complete! Model saved successfully to tts_student_model.pth")


if __name__ == "__main__":
    main()
