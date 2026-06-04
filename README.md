# 🎬 AI Video Content Studio - User Manual

Thank you for purchasing **AI Video Content Studio**! This software allows you to automate the creation of high-quality YouTube Shorts, TikToks, and widescreen videos using cloud-based AI video generators and local voiceover compilation.

---

## 🚀 Quick Start Guide

### Step 1: Install Prerequisites (First Time Only)
To run this software, you need two free tools installed on your computer:
1. **Node.js**: Download and install the LTS version from [https://nodejs.org/](https://nodejs.org/).
2. **Python**: Download and install Python from [https://www.python.org/](https://www.python.org/). 
   * *CRITICAL: Make sure to check the box that says **"Add python.exe to PATH"** during installation!*
3. **FFmpeg**: Ensure FFmpeg is installed and added to your system PATH environment variables (required for video compilation).

### Step 2: Run the Studio
1. Extract the downloaded ZIP file into a folder on your computer.
2. Double-click **`start.bat`**. 
3. The launcher will automatically verify Node/Python, download necessary libraries, start your local server, and open the studio interface in your web browser at **`http://localhost:3000`**!

---

## 🎬 How to Generate Videos

### 1. Configure Your AI Provider
In the left sidebar settings panel, you can choose how your videos are generated:
* **Option A: Google Colab (100% Free)**
  1. Follow the link/notebook code to open a Google Colab notebook.
  2. Run the notebook on a free GPU runtime.
  3. Copy the Cloudflare tunnel link (e.g., `https://xxxx.trycloudflare.com`) and paste it into the **ComfyUI Colab Tunnel URL** field.
* **Option B: Fal.ai or Replicate APIs (Recommended - Fast & Paid)**
  1. Register an account at [Fal.ai](https://fal.ai) or [Replicate.com](https://replicate.com) (they give you free starting credits).
  2. Paste your API Key in the sidebar settings.

### 2. Enter Your Script
1. Paste your script into the **Video Script** box.
2. Write one sentence per line (e.g., each line represents one scene).
3. Click **Generate Storyboard Scenes 🚀**.

### 3. Review & Edit Visual Prompts
* The studio will generate card lists. 
* Edit the **AI Video Prompt** on each card to match the visual style you want. 
* *Tip: For cartoon consistency, describe the character's clothing and hair in every prompt! (e.g., "3D Pixar style, a 7-year-old boy in a red shirt, blue shorts, and yellow boots...")*

### 4. Click Batch Generate
1. Click **`⚡ Batch Generate All`** at the top right of the storyboard list.
2. Sit back and watch the console log as it renders each voiceover, generates the video clips, downloads them, and compiles them.
3. Once complete, you will see a preview of the final `.mp4` file ready to download and upload to YouTube!
