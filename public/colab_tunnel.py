# ============================================================================
# 1. MOUNT GOOGLE DRIVE
# ============================================================================
from google.colab import drive
print("📂 Mounting Google Drive...")
drive.mount('/content/drive')

# ============================================================================
# 2. SETUP DIRECTORIES & CLONE COMFYUI
# ============================================================================
import os
import sys
import re
import time
import shutil
import subprocess
import socket
import threading

os.makedirs('/content/drive/MyDrive', exist_ok=True)
os.chdir('/content/drive/MyDrive')

if not os.path.exists("ComfyUI"):
    print("📥 Cloning ComfyUI repository...")
    subprocess.run(["git", "clone", "https://github.com/comfyanonymous/ComfyUI.git"], check=True)
else:
    print("✅ ComfyUI already exists, skipping clone...")

os.chdir("ComfyUI")
print("🔄 Updating ComfyUI...")
try:
    subprocess.run(["git", "pull"], check=True)
except Exception:
    print("⚠️ Local modifications detected. Attempting to force update...")
    try:
        subprocess.run(["git", "stash"], check=False)
        subprocess.run(["git", "reset", "--hard", "origin/master"], check=False)
        subprocess.run(["git", "pull"], check=False)
        print("✅ Force update completed.")
    except Exception as e:
        print(f"⚠️ Could not update ComfyUI: {e}. Proceeding with existing version...")

# Create folders if missing
os.makedirs("models/checkpoints", exist_ok=True)
os.makedirs("models/animatediff_models", exist_ok=True)
os.makedirs("custom_nodes", exist_ok=True)

# ============================================================================
# 3. INSTALL SYSTEM DEPENDENCIES
# ============================================================================
if not shutil.which("ffmpeg"):
    print("📦 Installing system packages (ffmpeg, wget)...")
    subprocess.run(["apt-get", "update", "-y", "-q"], check=True)
    subprocess.run(["apt-get", "install", "-y", "-q", "wget", "git", "ffmpeg", "libsm6", "libxext6"], check=True)
    print("✅ System packages installed!")
else:
    print("✅ ffmpeg already installed, skipping...")

# ============================================================================
# 4. INSTALL PIP PACKAGES
# ============================================================================

# Check PyTorch
try:
    import torch
    print(f"✅ PyTorch already installed: {torch.__version__}, skipping...")
except ImportError:
    print("📦 Installing PyTorch, Xformers...")
    subprocess.run(["pip", "uninstall", "-y", "torch", "torchvision", "torchaudio", "xformers"], check=True)
    subprocess.run(["pip", "install", "-q", "torch==2.5.1", "torchvision==0.20.1", "torchaudio==2.5.1", "xformers", "--index-url", "https://download.pytorch.org/whl/cu121"], check=True)
    print("✅ PyTorch installed!")

# Check ComfyUI core requirements
try:
    import aiohttp
    import safetensors
    import kornia
    print("✅ Core requirements already installed, skipping...")
except ImportError:
    print("📦 Installing ComfyUI core requirements...")
    subprocess.run(["pip", "install", "-r", "requirements.txt", "-q"], check=True)
    print("✅ Core requirements installed!")

# Check auxiliary packages
try:
    import accelerate
    import einops
    import transformers
    import pandas
    import soundfile
    print("✅ Auxiliary packages already installed, skipping...")
except ImportError:
    print("📦 Installing auxiliary packages...")
    subprocess.run(["pip", "install", "-q",
        "accelerate",
        "einops",
        "transformers>=4.28.1",
        "safetensors>=0.4.2",
        "aiohttp",
        "pyyaml",
        "Pillow",
        "scipy",
        "tqdm",
        "psutil",
        "kornia>=0.7.1",
        "spandrel",
        "soundfile",
        "sentencepiece",
        "opencv-python",
        "imageio-ffmpeg",
        "imageio[ffmpeg]",
        "pandas"
    ], check=True)
    print("✅ Auxiliary packages installed!")

# ============================================================================
# 5. INSTALL CUSTOM NODES
# ============================================================================
print("🔌 Loading Custom Nodes...")
os.chdir("custom_nodes")

def update_node_safely(repo_name, clone_url):
    if not os.path.exists(repo_name):
        print(f"📥 Cloning {repo_name}...")
        try:
            subprocess.run(["git", "clone", clone_url], check=True)
        except Exception as e:
            print(f"❌ Failed to clone {repo_name}: {e}")
    else:
        print(f"✅ {repo_name} already exists, skipping clone...")
        print(f"🔄 Updating {repo_name}...")
        os.chdir(repo_name)
        try:
            subprocess.run(["git", "pull"], check=True)
        except Exception:
            print(f"⚠️ Failed to update {repo_name} cleanly. Forcing reset...")
            try:
                subprocess.run(["git", "stash"], check=False)
                subprocess.run(["git", "reset", "--hard", "origin/master"], check=False)
                subprocess.run(["git", "reset", "--hard", "origin/main"], check=False)
                subprocess.run(["git", "pull"], check=False)
            except Exception as e:
                print(f"⚠️ Reset failed: {e}. Proceeding with current local version...")
        os.chdir("..")

# 1. ComfyUI Manager
update_node_safely("ComfyUI-Manager", "https://github.com/ltdrdata/ComfyUI-Manager.git")

# 2. AnimateDiff Evolved
update_node_safely("ComfyUI-AnimateDiff-Evolved", "https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved.git")

# 3. Video Helper Suite
update_node_safely("ComfyUI-VideoHelperSuite", "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git")

# Install VideoHelperSuite requirements only once using flag file
vhs_req_flag = "ComfyUI-VideoHelperSuite/.requirements_installed"
if os.path.exists("ComfyUI-VideoHelperSuite") and not os.path.exists(vhs_req_flag):
    print("📦 Installing VideoHelperSuite requirements...")
    os.chdir("ComfyUI-VideoHelperSuite")
    try:
        subprocess.run(["pip", "install", "-r", "requirements.txt", "-q"], check=True)
        open(".requirements_installed", 'w').close()
        print("✅ VideoHelperSuite requirements installed!")
    except Exception as e:
        print(f"⚠️ VideoHelperSuite requirements failed: {e}")
    os.chdir("..")
else:
    print("✅ VideoHelperSuite requirements already installed, skipping...")

os.chdir("..")

# ============================================================================
# 6. DOWNLOAD MODELS (Only if missing)
# ============================================================================

# Checkpoint model
ckpt_path = "models/checkpoints/RealVisXL_V4.0.safetensors"
if not os.path.exists(ckpt_path):
    print("📥 Downloading RealVisXL V4.0 SDXL checkpoint (~6.5 GB)...")
    subprocess.run(["wget", "-c",
        "https://huggingface.co/SG161222/RealVisXL_V4.0/resolve/main/RealVisXL_V4.0.safetensors",
        "-P", "models/checkpoints/"
    ], check=True)
    print("✅ Checkpoint downloaded!")
else:
    print("✅ Checkpoint RealVisXL_V4.0 already exists, skipping...")

# AnimateDiff Motion Model
motion_model_path = "models/animatediff_models/mm_sdxl_v10_beta.ckpt"
if not os.path.exists(motion_model_path):
    print("📥 Downloading AnimateDiff SDXL motion module...")
    subprocess.run(["wget", "-c",
        "https://huggingface.co/guoyww/AnimateDiff/resolve/main/mm_sdxl_v10_beta.ckpt",
        "-P", "models/animatediff_models/"
    ], check=True)
    print("✅ AnimateDiff motion model downloaded!")
else:
    print("✅ AnimateDiff motion model already exists, skipping...")

# ============================================================================
# 7. INSTALL CLOUDFLARED (Only if missing)
# ============================================================================
if not shutil.which("cloudflared"):
    print("📥 Installing cloudflared...")
    subprocess.run(["wget", "-q",
        "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb"
    ], check=True)
    subprocess.run(["dpkg", "-i", "cloudflared-linux-amd64.deb"], check=True)
    if os.path.exists("cloudflared-linux-amd64.deb"):
        os.remove("cloudflared-linux-amd64.deb")
    print("✅ cloudflared installed!")
else:
    print("✅ cloudflared already installed, skipping...")

# ============================================================================
# 8. LAUNCH BACKGROUND TUNNEL & FOREGROUND COMFYUI
# ============================================================================
def launch_cloudflared(port=8188):
    while True:
        time.sleep(0.5)
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        result = sock.connect_ex(('127.0.0.1', port))
        if result == 0:
            break
        sock.close()

    print("\n" + "="*60)
    print("🚀 ComfyUI port is active! Launching tunnel...")
    print("="*60 + "\n")

    process = subprocess.Popen(
        ['cloudflared', 'tunnel', '--url', f'http://127.0.0.1:{port}'],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )

    for line in iter(process.stderr.readline, ''):
        if 'trycloudflare.com' in line:
            match = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', line)
            if match:
                url = match.group(0)
                print("\n" + "="*80)
                print("🎥 COMFYUI PUBLIC URL:")
                print(f"👉 {url} 👈")
                print("="*80 + "\n")
                print("Copy this link and paste it into the Local AI Studio settings!")
                break

    def log_tunnel():
        for line in iter(process.stderr.readline, ''):
            pass
    threading.Thread(target=log_tunnel, daemon=True).start()

# Clear ports & start background tunnel thread
subprocess.run("fuser -k 8188/tcp 2>/dev/null", shell=True)
threading.Thread(target=launch_cloudflared, daemon=True).start()

# Launch ComfyUI Server in foreground
print("🚀 Starting ComfyUI Server...")
subprocess.run(["python", "main.py", "--dont-upcast-attention", "--listen", "127.0.0.1", "--port", "8188"])
