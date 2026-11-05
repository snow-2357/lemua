import torch
from dataset import TTSTeacherDataset
from synthesize import load_student, phoneme_token_ids
import matplotlib.pyplot as plt

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = load_student(device)
ds = TTSTeacherDataset("dataset_cache")
item = ds[0]
tokens = item["tokens"].unsqueeze(0).to(device)
target = item["mel"]

with torch.inference_mode():
    pred, _ = model(tokens, max_frames=target.shape[0])
pred = pred.squeeze(0).cpu()

print("target mean/std:", target.mean().item(), target.std().item())
print("pred   mean/std:", pred.mean().item(), pred.std().item())

fig, ax = plt.subplots(2, 1, figsize=(10, 6))
ax[0].imshow(target.T, origin="lower", aspect="auto")
ax[0].set_title("target")
ax[1].imshow(pred.T, origin="lower", aspect="auto")
ax[1].set_title("student")
plt.savefig("mel_compare.png")
