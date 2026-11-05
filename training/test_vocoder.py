import sys
import soundfile as sf
import torch
import torchaudio

from dataset import HiFiGANMel, SAMPLE_RATE
from synthesize import load_vocoder, VOCODER_SAMPLE_RATE

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

audio, sr = sf.read("dataset_cache/sentence_0000/audio.wav", dtype="float32")
wav = torch.from_numpy(audio).unsqueeze(0)
if sr != SAMPLE_RATE:
    wav = torchaudio.functional.resample(wav, sr, SAMPLE_RATE)

mel = HiFiGANMel()(wav)  # (1, 80, frames)
print("mel shape", mel.shape, "min", mel.min().item(), "max", mel.max().item())

vocoder = load_vocoder(device)
with torch.inference_mode():
    out = vocoder(mel.to(device))

sf.write("vocoder_test.wav", out.squeeze().cpu().numpy(), VOCODER_SAMPLE_RATE)
print("saved vocoder_test.wav")
