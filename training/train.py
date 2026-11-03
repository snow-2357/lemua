import argparse
import os
from pathlib import Path

import torch
import torch.nn.functional as F
from torch.nn.utils.rnn import pad_sequence
from torch.utils.data import DataLoader, random_split

from dataset import TTSTeacherDataset
from model import TTSStudentModel


TRAINING_DIR = Path(__file__).resolve().parent
CHECKPOINT_PATH = TRAINING_DIR / "tts_student_model.pth"
TRAINING_STATE_PATH = TRAINING_DIR / "tts_student_training_state.pth"
VOCAB_SIZE = 10000
HIDDEN_DIM = 256
MAX_FRAMES = 1600
BATCH_SIZE = 8
NUM_WORKERS = 2
DEFAULT_EPOCHS = 100
CHECKPOINT_FORMAT_VERSION = 4
INPUT_ENCODING = "espeak_ipa_codepoint"


def tts_collate_fn(batch):
    tokens = pad_sequence(
        [item["tokens"] for item in batch], batch_first=True, padding_value=0
    )
    mels = pad_sequence(
        [item["mel"] for item in batch], batch_first=True, padding_value=0.0
    )
    frame_lengths = torch.tensor([item["mel"].size(0) for item in batch])
    return tokens, mels, frame_lengths


def evaluate(model, dataloader, device):
    model.eval()
    mel_error = 0.0
    frame_count_total = 0
    length_error = 0.0
    sample_count = 0

    with torch.inference_mode():
        for tokens, target_mels, frame_lengths in dataloader:
            tokens = tokens.to(device)
            target_mels = target_mels.to(device)
            frame_lengths = frame_lengths.to(device)
            frame_count = target_mels.size(1)
            if frame_count > MAX_FRAMES:
                raise ValueError(
                    f"Audio needs {frame_count} mel frames; increase MAX_FRAMES."
                )

            predicted_mels, predicted_log_lengths = model(
                tokens, frame_count, frame_lengths
            )
            frame_mask = (
                torch.arange(frame_count, device=device).unsqueeze(0)
                < frame_lengths.unsqueeze(1)
            )
            mel_error += F.l1_loss(
                predicted_mels[frame_mask], target_mels[frame_mask], reduction="sum"
            ).item()
            frame_count_total += int(frame_mask.sum().item()) * target_mels.size(2)
            length_error += F.mse_loss(
                predicted_log_lengths,
                torch.log1p(frame_lengths.float()),
                reduction="sum",
            ).item()
            sample_count += tokens.size(0)

    return mel_error / frame_count_total, length_error / sample_count


def save_checkpoint(
    path,
    model,
    optimizer,
    scheduler,
    epoch,
    validation_loss,
    best_validation_loss,
    best_mel_error,
    best_epoch,
    stale_epochs,
):
    temporary_path = path.with_suffix(".tmp")
    torch.save(
        {
            "format_version": CHECKPOINT_FORMAT_VERSION,
            "input_encoding": INPUT_ENCODING,
            "model_state_dict": model.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
            "scheduler_state_dict": scheduler.state_dict(),
            "vocab_size": VOCAB_SIZE,
            "hidden_dim": HIDDEN_DIM,
            "max_frames": MAX_FRAMES,
            "epoch": epoch,
            "validation_loss": validation_loss,
            "best_validation_loss": best_validation_loss,
            "best_mel_error": best_mel_error,
            "best_epoch": best_epoch,
            "stale_epochs": stale_epochs,
        },
        temporary_path,
    )
    os.replace(temporary_path, path)


def main():
    parser = argparse.ArgumentParser(
        description="Train the eSpeak-phoneme-to-mel student on cached speech audio."
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=DEFAULT_EPOCHS,
        help="Additional epochs to train (default: 100).",
    )
    parser.add_argument(
        "--patience",
        type=int,
        default=None,
        help="Enable early stopping after this many epochs without improvement.",
    )
    parser.add_argument(
        "--restart",
        action="store_true",
        help="Ignore the existing checkpoint and start with fresh weights.",
    )
    args = parser.parse_args()
    if args.epochs < 1 or (args.patience is not None and args.patience < 1):
        parser.error("--epochs and --patience must be positive when provided.")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Training on device: {device}")

    dataset = TTSTeacherDataset(str(TRAINING_DIR / "dataset_cache"))
    if len(dataset) < 2:
        raise ValueError("Training requires at least two cached audio samples.")
    split_generator = torch.Generator().manual_seed(42)
    train_size = int(len(dataset) * 0.95)
    train_set, validation_set = random_split(
        dataset, [train_size, len(dataset) - train_size], generator=split_generator
    )
    train_loader = DataLoader(
        train_set,
        batch_size=BATCH_SIZE,
        shuffle=True,
        collate_fn=tts_collate_fn,
        num_workers=NUM_WORKERS,
        pin_memory=device.type == "cuda",
        persistent_workers=NUM_WORKERS > 0,
    )
    validation_loader = DataLoader(
        validation_set,
        batch_size=BATCH_SIZE,
        shuffle=False,
        collate_fn=tts_collate_fn,
        num_workers=NUM_WORKERS,
        pin_memory=device.type == "cuda",
        persistent_workers=NUM_WORKERS > 0,
    )
    print(
        f"Loaded {len(train_set)} training and {len(validation_set)} validation samples."
    )

    model = TTSStudentModel(
        vocab_size=VOCAB_SIZE, hidden_dim=HIDDEN_DIM, max_frames=MAX_FRAMES
    ).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="min", factor=0.5, patience=5
    )
    start_epoch = 0

    resume_path = (
        TRAINING_STATE_PATH
        if TRAINING_STATE_PATH.is_file()
        else CHECKPOINT_PATH
    )
    checkpoint = None
    if resume_path.is_file() and not args.restart:
        checkpoint = torch.load(
            resume_path, map_location=device, weights_only=True
        )
        if (
            isinstance(checkpoint, dict)
            and checkpoint.get("format_version") == CHECKPOINT_FORMAT_VERSION
            and checkpoint.get("input_encoding") == INPUT_ENCODING
            and checkpoint.get("vocab_size") == VOCAB_SIZE
            and checkpoint.get("hidden_dim") == HIDDEN_DIM
            and checkpoint.get("max_frames") == MAX_FRAMES
        ):
            model.load_state_dict(checkpoint["model_state_dict"])
            if "optimizer_state_dict" in checkpoint:
                optimizer.load_state_dict(checkpoint["optimizer_state_dict"])
            start_epoch = int(checkpoint.get("epoch", 0))
            if "scheduler_state_dict" in checkpoint:
                scheduler.load_state_dict(checkpoint["scheduler_state_dict"])
            best_validation_loss = float(
                checkpoint.get(
                    "best_validation_loss",
                    checkpoint.get("validation_loss", float("inf")),
                )
            )
            best_mel_error = float(checkpoint.get("best_mel_error", float("inf")))
            best_epoch = int(checkpoint.get("best_epoch", start_epoch))
            print(
                f"Resuming from epoch {start_epoch} "
                f"in {resume_path}."
            )
        else:
            raise RuntimeError(
                "Existing checkpoint is incompatible with eSpeak phoneme input. "
                "Run `python train.py --restart` to start the "
                "phoneme-to-mel student from fresh weights."
            )

    current_mel_error, current_length_error = evaluate(
        model, validation_loader, device
    )
    if args.restart or checkpoint is None:
        best_validation_loss = float("inf")
        best_mel_error = float("inf")
        best_epoch = 0
    elif not torch.isfinite(torch.tensor(best_mel_error)):
        best_mel_error = current_mel_error
    print(
        f"Starting validation: mel L1={current_mel_error:.4f}, "
        f"length MSE={current_length_error:.4f}"
    )

    if start_epoch:
        print("Starting a fresh early-stopping window at the resumed learning rate.")
    if args.patience is None:
        print("Early stopping is disabled; all requested epochs will run.")
    stale_epochs = 0

    for epoch in range(start_epoch + 1, start_epoch + args.epochs + 1):
        model.train()
        train_loss_total = 0.0

        for tokens, target_mels, frame_lengths in train_loader:
            tokens = tokens.to(device, non_blocking=True)
            target_mels = target_mels.to(device, non_blocking=True)
            frame_lengths = frame_lengths.to(device, non_blocking=True)
            frame_count = target_mels.size(1)
            if frame_count > MAX_FRAMES:
                raise ValueError(
                    f"Audio needs {frame_count} mel frames; increase MAX_FRAMES."
                )

            predicted_mels, predicted_log_lengths = model(
                tokens, frame_count, frame_lengths
            )
            frame_mask = (
                torch.arange(frame_count, device=device).unsqueeze(0)
                < frame_lengths.unsqueeze(1)
            )
            mel_loss = F.l1_loss(
                predicted_mels[frame_mask], target_mels[frame_mask]
            )
            length_loss = F.mse_loss(
                predicted_log_lengths, torch.log1p(frame_lengths.float())
            )
            loss = mel_loss + 0.1 * length_loss

            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            train_loss_total += loss.item()

        validation_mel_error, validation_length_error = evaluate(
            model, validation_loader, device
        )
        validation_loss = validation_mel_error + 0.1 * validation_length_error
        scheduler.step(validation_loss)
        print(
            f"Epoch {epoch} (run {epoch - start_epoch}/{args.epochs}) | "
            f"Train loss: {train_loss_total / len(train_loader):.4f} | "
            f"Validation mel L1: {validation_mel_error:.4f} | "
            f"Validation length MSE: {validation_length_error:.4f}"
        )

        if validation_loss < best_validation_loss:
            best_validation_loss = validation_loss
            best_mel_error = validation_mel_error
            best_epoch = epoch
            stale_epochs = 0
            save_checkpoint(
                CHECKPOINT_PATH,
                model,
                optimizer,
                scheduler,
                epoch,
                validation_loss,
                best_validation_loss,
                best_mel_error,
                best_epoch,
                stale_epochs,
            )
            print(f"Saved improved student checkpoint to {CHECKPOINT_PATH}.")
        else:
            stale_epochs += 1

        save_checkpoint(
            TRAINING_STATE_PATH,
            model,
            optimizer,
            scheduler,
            epoch,
            validation_loss,
            best_validation_loss,
            best_mel_error,
            best_epoch,
            stale_epochs,
        )
        if args.patience is not None and stale_epochs >= args.patience:
            print("Stopping: validation loss did not improve.")
            break

    print(
        f"Training finished. Best validation mel L1: {best_mel_error:.4f} "
        f"(best checkpoint epoch {best_epoch})."
    )
    print(f"Student checkpoint: {CHECKPOINT_PATH}")


if __name__ == "__main__":
    main()
