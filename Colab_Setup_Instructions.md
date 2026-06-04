# Run ComfyUI on Google Colab (Free GPU)

Follow these steps to spin up ComfyUI on Google Colab's free T4 GPU and get your public tunnel URL to paste into the **Local AI Video Studio**.

---

### Step 1: Open Google Colab
1. Go to [Google Colab](https://colab.research.google.com/).
2. Click **New Notebook** (bottom right of the popup).

---

### Step 2: Configure GPU Runtime
1. In the Colab menu, click **Runtime** > **Change runtime type**.
2. Select **T4 GPU** under Hardware Accelerator.
3. Click **Save**.

---

### Step 3: Copy and Run the Code Cell
Create a new code cell, paste the following script, and click the **Run (Play)** button. 

This script installs ComfyUI, installs the Video Combine custom nodes, downloads the Stable Video Diffusion (SVD) model, launches ComfyUI, and exposes it through a free **Pinggy** public URL.

```python
# ----------------------------------------------------
# 1. Install ComfyUI and dependencies
# ----------------------------------------------------
print("📥 Installing ComfyUI...")
!git clone https://github.com/comfyanonymous/ComfyUI.git
%cd ComfyUI
!pip install -r requirements.txt --quiet

# ----------------------------------------------------
# 2. Install VideoHelperSuite (Crucial for Video Output)
# ----------------------------------------------------
print("📥 Installing Video Helper Suite Nodes...")
%cd custom_nodes
!git clone https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git
%cd ComfyUI-VideoHelperSuite
!pip install -r requirements.txt --quiet
%cd ../..

# ----------------------------------------------------
# 3. Download Stable Video Diffusion (SVD XT) Model
# ----------------------------------------------------
print("📥 Downloading SVD-XT Model (~9.5 GB - might take a few minutes)...")
!wget -c https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt/resolve/main/svd_xt.safetensors -P models/checkpoints/

# ----------------------------------------------------
# 4. Start ComfyUI Server in the Background
# ----------------------------------------------------
import subprocess
import time

print("🚀 Starting ComfyUI Server...")
comfy_proc = subprocess.Popen(["python", "main.py", "--listen", "127.0.0.1", "--port", "8188"])

# Wait for server startup
time.sleep(12)
print("✅ ComfyUI is up and running locally in Colab.")

# ----------------------------------------------------
# 5. Create a Secure Public Tunnel (via Pinggy)
# ----------------------------------------------------
print("🌐 Creating Public URL. Click the .pinggy.link URL below to connect:")
!ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -R 80:localhost:8188 a.pinggy.io
```

---

### Step 4: Connecting the Local Studio App
1. Once the script finishes setting up, it will print a link that looks like:
   `http://xxxx.pinggy.link` or `https://xxxx.pinggy.link`
2. **Copy** that link.
3. Open the **Local AI Video Studio** dashboard in your browser.
4. Go to **Settings**, select **ComfyUI** as the provider, and **paste** the link in the "ComfyUI API URL" box.
5. You are ready to generate videos! All rendering happens in the cloud on the Colab GPU.
